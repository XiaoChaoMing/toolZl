import { logInfo, logError } from "../utils/logger.js";

const jobs = new Map();

function makeId(prefix = "job") {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function createJob(initial) {
  const id = makeId("excel");
  const now = Date.now();

  const job = {
    id,
    type: "excel",
    status: "pending", // pending | running | paused | completed | failed | cancelled
    createdAt: now,
    updatedAt: now,

    totalPhones: 0,
    processed: 0,
    currentIndex: 0,
    currentPhone: null,

    stats: {
      total: 0,
      invalid: 0,
      found: 0,
      notFound: 0,
      error: 0,
      sendMessageSuccess: 0,
      sendMessageFailed: 0,
    },

    downloadUrl: null,
    warning: null,
    error: null,

    // Auto-resume tracking for rate limits
    pausedUntil: null,        // timestamp when should auto-resume
    pauseReason: null,        // 'manual' | 'rate_limit' | 'error'
    retryDelay: initial?.retryDelay || (20 * 60 * 1000), // Default 20 minutes
    retryCount: 0,            // number of rate limit retries

    ...initial,
  };

  jobs.set(id, job);
  logInfo("job_created", {
    jobId: id,
    type: job.type,
    status: job.status,
    totalPhones: job.totalPhones,
  });
  return job;
}

export function getJob(id) {
  return jobs.get(id) || null;
}

export function getActiveExcelJob() {
  for (const job of jobs.values()) {
    if (
      job?.type === "excel" &&
      (job.status === "pending" || job.status === "running" || job.status === "paused")
    ) {
      return job;
    }
  }
  return null;
}

export function listExcelJobs() {
  const items = [];
  for (const job of jobs.values()) {
    if (job?.type !== "excel") continue;
    items.push(job);
  }
  // newest first
  items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return items;
}

export function updateJob(id, patch) {
  const job = jobs.get(id);
  if (!job) return null;
  Object.assign(job, patch, { updatedAt: Date.now() });
  logInfo("job_updated", {
    jobId: id,
    status: job.status,
    totalPhones: job.totalPhones,
    processed: job.processed,
    currentPhone: job.currentPhone,
    error: job.error || null,
  });
  return job;
}

/**
 * Auto-pause job with scheduled resume time
 * @param {string} id - Job ID
 * @param {string} reason - 'manual' | 'rate_limit' | 'error'
 * @param {number} delayMs - Delay in milliseconds before auto-resume
 */
export function autoPauseJob(id, reason, delayMs) {
  const job = getJob(id);
  if (!job) return null;

  const pausedUntil = Date.now() + delayMs;

  return updateJob(id, {
    status: 'paused',
    pauseReason: reason,
    pausedUntil: pausedUntil,
    retryCount: (job.retryCount || 0) + 1
  });
}

/**
 * Check if job should auto-resume (timeout has passed)
 * @param {string} id - Job ID
 * @returns {boolean}
 */
export function shouldAutoResume(id) {
  const job = getJob(id);
  if (!job) return false;
  if (job.status !== 'paused') return false;
  if (!job.pausedUntil) return false;

  return Date.now() >= job.pausedUntil;
}

/**
 * Manual resume - clears pausedUntil
 * @param {string} id - Job ID
 */
export function manualResumeJob(id) {
  const job = getJob(id);
  if (!job) return null;

  return updateJob(id, {
    status: 'running',
    pausedUntil: null,
    pauseReason: null,
    warning: null
  });
}

/**
 * Set retry delay for a job
 * @param {string} id - Job ID
 * @param {number} delayMs - Delay in milliseconds
 */
export function setJobRetryDelay(id, delayMs) {
  const job = getJob(id);
  if (!job) return null;

  return updateJob(id, {
    retryDelay: delayMs
  });
}
