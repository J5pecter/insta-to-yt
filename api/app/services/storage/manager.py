"""Storage manager for SocialRelay: UUID organization, disk space monitoring, and retention cleanup."""
from __future__ import annotations

import hashlib
import os
import shutil
import time
import uuid
from pathlib import Path
from typing import Optional, Tuple

from ...core.config import settings


class StorageError(RuntimeError):
    pass


class StorageManager:
    def __init__(self, base_dir: Path = settings.STORAGE_DIR):
        self.base_dir = base_dir
        self.originals = settings.originals_dir
        self.processed = settings.processed_dir
        self.thumbnails = settings.thumbnails_dir
        self.temporary = settings.temporary_dir
        self.backups = settings.backups_dir

    def check_disk_space(self, required_mb: int = 100) -> bool:
        """Verify that sufficient disk space is available."""
        total, used, free = shutil.disk_usage(self.base_dir)
        free_mb = free // (1024 * 1024)
        if free_mb < max(required_mb, settings.DISK_FREE_MIN_MB):
            raise StorageError(f"Insufficient disk space: {free_mb} MB free, minimum required is {settings.DISK_FREE_MIN_MB} MB.")
        return True

    def calculate_sha256(self, path: Path) -> str:
        """Calculate the SHA-256 checksum of a file."""
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                h.update(chunk)
        return h.hexdigest()

    def allocate_path(self, category: str, extension: str = "mp4", file_id: Optional[str] = None) -> Path:
        """Allocate a path inside the requested storage partition using a UUID."""
        fid = file_id or str(uuid.uuid4())
        ext = extension.lstrip(".")
        target_dir = getattr(self, category, self.temporary)
        target_dir.mkdir(parents=True, exist_ok=True)
        return target_dir / f"{fid}.{ext}"

    def save_upload(self, src_stream, extension: str = "mp4") -> Tuple[Path, str, int]:
        """Save an uploaded file, returning (Path, sha256_hash, file_size_bytes)."""
        self.check_disk_space()
        target_path = self.allocate_path("originals", extension=extension)
        h = hashlib.sha256()
        size = 0

        with open(target_path, "wb") as dest:
            while chunk := src_stream.read(1024 * 1024):
                dest.write(chunk)
                h.update(chunk)
                size += len(chunk)
                if size > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
                    dest.close()
                    target_path.unlink(missing_ok=True)
                    raise StorageError(f"File size exceeds maximum allowed upload size of {settings.MAX_UPLOAD_SIZE_MB} MB.")

        return target_path, h.hexdigest(), size

    def cleanup_temporary_files(self, max_age_hours: int = settings.TEMP_RETENTION_HOURS) -> int:
        """Remove temporary processing files older than configured retention period."""
        count = 0
        now = time.time()
        max_age_sec = max_age_hours * 3600
        for item in self.temporary.glob("*"):
            if item.is_file():
                try:
                    if now - item.stat().st_mtime > max_age_sec:
                        item.unlink()
                        count += 1
                except Exception:
                    pass
            elif item.is_dir():
                try:
                    if now - item.stat().st_mtime > max_age_sec:
                        shutil.rmtree(item, ignore_errors=True)
                        count += 1
                except Exception:
                    pass
        return count

    def get_storage_stats(self) -> dict:
        """Return disk usage statistics for the storage system."""
        total, used, free = shutil.disk_usage(self.base_dir)
        def dir_size(p: Path) -> int:
            return sum(f.stat().st_size for f in p.rglob("*") if f.is_file())

        return {
            "total_bytes": total,
            "used_bytes": used,
            "free_bytes": free,
            "free_mb": free // (1024 * 1024),
            "originals_bytes": dir_size(self.originals),
            "processed_bytes": dir_size(self.processed),
            "thumbnails_bytes": dir_size(self.thumbnails),
            "temporary_bytes": dir_size(self.temporary),
            "backups_bytes": dir_size(self.backups),
        }


storage_manager = StorageManager()
