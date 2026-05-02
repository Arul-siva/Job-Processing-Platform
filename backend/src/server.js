require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const { connectRedis, redisClient } = require('./redis/client');
const { startWorker } = require('./redis/worker');
const { enqueueJob } = require('./redis/queue');
const rateLimiter = require('./middleware/rateLimiter');
const { authMiddleware, generateToken } = require('./middleware/auth');
const Job = require('./models/Job');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// Attach io to be accessible in routes/workers
app.set('io', io);
global.io = io; // Inject to node environment so decoupled worker can use it

// API Routes
app.post('/login', (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });
  // For simplicity, generate token directly without passwords
  const token = generateToken(username);
  res.json({ token, userId: username });
});

app.post('/job', authMiddleware, rateLimiter(5, 60000), async (req, res) => {
  try {
    const { type, payload, priority } = req.body;
    const userId = req.user.userId;
    
    if (!type || !payload) {
      return res.status(400).json({ error: 'Type and payload are required' });
    }

    const job = await enqueueJob(type, payload, userId, priority || 'medium');
    io.to(userId).emit('job_created', job);
    
    res.status(201).json(job);
  } catch (err) {
    console.error('Job creation error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/jobs', authMiddleware, async (req, res) => {
  try {
    const { status, priority } = req.query;
    const userId = req.user.userId;
    
    // Performance Optimization: Short TTL Cache
    const cacheKey = `cache:jobs:${userId}:${status || 'all'}:${priority || 'all'}`;
    const cachedJobs = await redisClient.get(cacheKey);
    if (cachedJobs) {
      return res.json(JSON.parse(cachedJobs));
    }

    // Ensure users only see their own jobs
    const query = { userId };
    if (status) query.status = status;
    if (priority) query.priority = priority;

    // Limit to 50 latest jobs
    const jobs = await Job.find(query).sort({ createdAt: -1 }).limit(50);
    
    // Cache for 5 seconds to reduce DB load under high dashboard refresh rates
    await redisClient.set(cacheKey, JSON.stringify(jobs), { EX: 5 });
    
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Observability Metrics
app.get('/metrics', async (req, res) => {
  try {
    const [totalJobs, failedJobs, pendingJobs, dlqSize] = await Promise.all([
      Job.countDocuments(),
      Job.countDocuments({ status: 'failed' }),
      Job.countDocuments({ status: 'pending' }),
      redisClient.sCard('jobs:dlq')
    ]);
    res.json({
      totalJobs,
      failedJobs,
      pendingJobs,
      dlqSize,
      uptimeSeconds: process.uptime()
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/job_platform';

const startServer = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('MongoDB Connected');

    await connectRedis();

    // Start background worker loop explicitly passing IO
    startWorker(io);

    io.on('connection', (socket) => {
      // Secure Socket connection by joining user-specific room
      const token = socket.handshake.auth.token;
      if (token) {
        try {
          const jwt = require('jsonwebtoken');
          const { JWT_SECRET } = require('./middleware/auth');
          const decoded = jwt.verify(token, JWT_SECRET);
          socket.join(decoded.userId);
          console.log(`Client ${socket.id} joined room for user ${decoded.userId}`);
        } catch (err) {
          console.log('Socket Auth failed');
        }
      }

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
      });
    });

    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

startServer();
