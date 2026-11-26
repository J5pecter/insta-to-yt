"""Background worker loop for SocialRelay.
Continuously processes queued jobs, reports heartbeats, and recovers stalled jobs.
"""
from __future__ import annotations

import logging
import os
import signal
import sys
import time
import uuid

from ..core.database import db_session
from .job_queue import JobQueue

logger = logging.getLogger("socialrelay.worker")


class WorkerRunner:
    def __init__(self, worker_id: str | None = None):
        self.worker_id = worker_id or f"worker_{os.getpid()}_{uuid.uuid4().hex[:6]}"
        self.running = True

    def stop(self, *args):
        logger.info(f"Stopping worker {self.worker_id}...")
        self.running = False

    def start(self, poll_interval: float = 3.0):
        logger.info(f"Starting SocialRelay background worker: {self.worker_id}")
        signal.signal(signal.SIGINT, self.stop)
        signal.signal(signal.SIGTERM, self.stop)

        last_recovery = 0.0

        while self.running:
            try:
                now = time.time()
                with db_session() as session:
                    queue = JobQueue(session)

                    # Periodic dead job recovery every 60 seconds
                    if now - last_recovery > 60:
                        recovered = queue.recover_abandoned_jobs()
                        if recovered:
                            logger.info(f"Worker {self.worker_id} recovered {recovered} abandoned jobs.")
                        last_recovery = now

                    # Acquire and run job
                    job = queue.acquire_next_job(self.worker_id)
                    if job:
                        logger.info(f"Claimed job {job.id} (type: {job.job_type})")
                        queue.execute_job(job, self.worker_id)
                    else:
                        time.sleep(poll_interval)
            except Exception as e:
                logger.error(f"Error in worker main loop: {e}")
                time.sleep(poll_interval)

        logger.info(f"Worker {self.worker_id} exited cleanly.")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    runner = WorkerRunner()
    runner.start()
