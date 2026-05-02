const { redisClient } = require('./client');
const Job = require('../models/Job');

const QUEUE_KEY = 'jobs:queue';

/**
 * Enqueue a job into MongoDB and Redis
 * @param {String} type 
 * @param {Object} payload 
 * @param {String} userId 
 * @param {String} priority ('high', 'medium', 'low')
 */
const enqueueJob = async (type, payload, userId, priority = 'medium') => {
  const priorityScores = { high: 1, medium: 5, low: 10 };
  const numericPriority = priorityScores[priority] || 5;

  // 1. Save to MongoDB
  const job = new Job({
    type,
    payload,
    userId,
    priority,
    status: 'pending'
  });
  await job.save();

  // 2. Add to Redis ZSET
  // ZADD jobs:queue <numericPriority> <jobId>
  await redisClient.zAdd(QUEUE_KEY, {
    score: numericPriority,
    value: job._id.toString()
  });

  return job;
};

module.exports = {
  enqueueJob,
  QUEUE_KEY
};
