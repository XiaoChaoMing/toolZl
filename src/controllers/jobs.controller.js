import { getJob, listExcelJobs, updateJob, setJobRetryDelay } from "../services/job.service.js";

export function listExcelJobsHandler(req, res) {
  const jobs = listExcelJobs();
  return res.json({
    success: true,
    jobs: jobs.map((job) => ({
      id: job.id,
      type: job.type,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      totalPhones: job.totalPhones,
      processed: job.processed,
      stats: job.stats,
      downloadUrl: job.downloadUrl,
      warning: job.warning,
      error: job.error,
    })),
  });
}

export function getJobStatus(req, res) {
  const { id } = req.params;
  const job = getJob(id);

  if (!job) {
    return res.status(404).json({
      success: false,
      message: "Job not found",
    });
  }

  return res.json({
    success: true,
    job: {
      id: job.id,
      status: job.status,
      totalPhones: job.totalPhones,
      processed: job.processed,
      currentIndex: job.currentIndex,
      currentPhone: job.currentPhone,
      stats: job.stats,
      downloadUrl: job.downloadUrl,
      warning: job.warning,
      error: job.error,
      // Auto-resume fields
      pausedUntil: job.pausedUntil,
      pauseReason: job.pauseReason,
      retryDelay: job.retryDelay,
      retryCount: job.retryCount,
    },
  });
}

export function pauseJob(req, res) {
  const { id } = req.params;
  const job = getJob(id);

  if (!job) {
    return res.status(404).json({
      success: false,
      message: "Job not found",
    });
  }

  if (job.status !== "running") {
    return res.status(400).json({
      success: false,
      message: `Job is not running (current status: ${job.status})`,
    });
  }

  const updatedJob = updateJob(id, { status: "paused" });

  return res.json({
    success: true,
    message: "Job paused",
    downloadUrl: updatedJob?.downloadUrl || null,
  });
}

export function resumeJob(req, res) {
  const { id } = req.params;
  const job = getJob(id);

  if (!job) {
    return res.status(404).json({
      success: false,
      message: "Job not found",
    });
  }

  if (job.status !== "paused") {
    return res.status(400).json({
      success: false,
      message: `Job is not paused (current status: ${job.status})`,
    });
  }

  updateJob(id, {
    status: "running",
    warning: null,
    pausedUntil: null,
    pauseReason: null
  });

  return res.json({
    success: true,
    message: "Job resumed",
  });
}

export function cancelJob(req, res) {
  const { id } = req.params;
  const job = getJob(id);

  if (!job) {
    return res.status(404).json({
      success: false,
      message: "Job not found",
    });
  }

  if (job.status === "completed" || job.status === "cancelled") {
    return res.status(400).json({
      success: false,
      message: `Job is already ${job.status}`,
    });
  }

  updateJob(id, { status: "cancelled" });

  return res.json({
    success: true,
    message: "Job cancelled",
  });
}

export function setRetryDelay(req, res) {
  const { id } = req.params;
  const { retryDelay } = req.body;

  const job = getJob(id);

  if (!job) {
    return res.status(404).json({
      success: false,
      message: "Job not found",
    });
  }

  const delayMs = Number(retryDelay);
  if (isNaN(delayMs) || delayMs < 60000 || delayMs > 60 * 60 * 1000) {
    return res.status(400).json({
      success: false,
      message: "Retry delay phải từ 1-60 phút (60000-3600000 ms)",
    });
  }

  const updated = setJobRetryDelay(id, delayMs);

  return res.json({
    success: true,
    message: "Retry delay updated",
    retryDelay: updated.retryDelay,
  });
}
