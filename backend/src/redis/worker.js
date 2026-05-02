const { redisClient } = require('./client');
const Job = require('../models/Job');
const { QUEUE_KEY } = require('./queue');

const PROCESSING_KEY = 'jobs:processing';
const DLQ_KEY = 'jobs:dlq';
const LOCK_PREFIX = 'lock:job:';
const VISIBILITY_TIMEOUT = 60000; // 60 seconds

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const processJob = async (jobId) => {
  // Wait exactly 2 seconds in "pending" state as requested!
  await sleep(2000);
  
  const lockKey = `${LOCK_PREFIX}${jobId}`;
  
  // Try to acquire lock
  const acquired = await redisClient.set(lockKey, 'locked', {
    NX: true,
    PX: VISIBILITY_TIMEOUT
  });

  if (!acquired) {
    return false; // Another worker is processing this job
  }

  try {
    // Move from queue to processing ZSET with current timestamp
    await redisClient.zRem(QUEUE_KEY, jobId);
    await redisClient.zAdd(PROCESSING_KEY, {
      score: Date.now(),
      value: jobId
    });

    const job = await Job.findById(jobId);
    if (!job) {
      await redisClient.zRem(PROCESSING_KEY, jobId);
      return true;
    }

    job.status = 'processing';
    await job.save();
    
    // Broadcast status update exclusively to job owner
    if (global_io_instance) {
      global_io_instance.to(job.userId.toString()).emit('job_processing', job.toObject());
    }

    // SIMULATE WORK (e.g. 2 to 5 seconds depending on payload content)
    await sleep(Math.floor(Math.random() * 3000) + 2000);

    // Simulate deliberate failure or 10% random chance
    if (job.payload && job.payload.forceFail === true) {
      throw new Error('Deliberate job failure triggered by user');
    } else if (Math.random() < 0.1) {
      throw new Error('Simulated random job failure');
    }

    // Success
    job.status = 'completed';
    await job.save();
    await redisClient.zRem(PROCESSING_KEY, jobId);
    if (global_io_instance) {
      global_io_instance.to(job.userId.toString()).emit('job_completed', job.toObject());
    }

  } catch (error) {
    const job = await Job.findById(jobId);
    if (job) {
      job.retries += 1;
      job.errorLog.push({ message: error.message });

      if (job.retries >= job.maxRetries) {
        job.status = 'dead-letter';
        await redisClient.sAdd(DLQ_KEY, jobId);
        if (global_io_instance) global_io_instance.to(job.userId.toString()).emit('job_failed', job.toObject());
      } else {
        job.status = 'pending';
        // Re-queue with same priority + slightly penalized or delayed
        const pScores = { high: 1, medium: 5, low: 10 };
        const score = pScores[job.priority] || 5;
        await redisClient.zAdd(QUEUE_KEY, {
          score,
          value: jobId
        });
        if (global_io_instance) global_io_instance.to(job.userId.toString()).emit('job_retry', job.toObject());
      }
      await job.save();
    }
    await redisClient.zRem(PROCESSING_KEY, jobId);
  } finally {
    // Release lock
    await redisClient.del(lockKey);
  }

  return true;
};

const workerLoop = async () => {
  console.log('Worker loop started');
  while (true) {
    try {
      // Get the highest priority job (lowest score)
      const jobs = await redisClient.zRangeWithScores(QUEUE_KEY, 0, 0);
      
      if (jobs && jobs.length > 0) {
        const jobId = jobs[0].value;
        const processed = await processJob(jobId);
        if (!processed) {
          // If lock wasn't acquired, sleep slightly and try next
          await sleep(500);
        }
      } else {
        // No jobs, sleep before polling again
        await sleep(1000);
      }
    } catch (err) {
      console.error('Worker error:', err);
      await sleep(1000);
    }
  }
};

const recoverySweeper = async () => {
  console.log('Recovery sweeper started');
  setInterval(async () => {
    try {
      const now = Date.now();
      const cutoff = now - VISIBILITY_TIMEOUT;
      
      // Get jobs stuck in processing for too long
      const stuckJobs = await redisClient.zRangeByScore(PROCESSING_KEY, 0, cutoff);
      
      for (const jobId of stuckJobs) {
        console.log(`Recovering stuck job ${jobId}`);
        const job = await Job.findById(jobId);
        if (job) {
          job.retries += 1;
          job.errorLog.push({ message: 'Job timed out (worker crash)' });
          
          if (job.retries >= job.maxRetries) {
            job.status = 'dead-letter';
            await redisClient.sAdd(DLQ_KEY, jobId);
          } else {
            job.status = 'pending';
            const pScores = { high: 1, medium: 5, low: 10 };
            await redisClient.zAdd(QUEUE_KEY, { score: pScores[job.priority] || 5, value: jobId });
          }
          await job.save();
        }
        await redisClient.zRem(PROCESSING_KEY, jobId);
        await redisClient.del(`${LOCK_PREFIX}${jobId}`);
      }
    } catch (err) {
      console.error('Sweeper error:', err);
    }
  }, 30000); // Check every 30 seconds
};

let global_io_instance = null;

const startWorker = (io) => {
  global_io_instance = io;
  workerLoop();
  recoverySweeper();
};

module.exports = {
  startWorker
};
