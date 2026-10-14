"""The record book: every Instagram link we have ever seen, and what happened to it.

Two things stop double uploads:
  1. Each Instagram post code can only exist once (UNIQUE shortcode).
  2. After download, the file's fingerprint (SHA-256) is compared with every
     earlier video, so the same clip under a different link is caught too.
Status changes that start an upload are "claims": only one caller can win.
"""
from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

# Status flow:
#   queued -> downloading -> analyzing -> review | upload_queued -> uploading -> uploaded
#   any step can end in failed; a file seen before ends in duplicate;
#   an upload cut off by a crash becomes interrupted (check YouTube before retrying).
IN_PROGRESS = ("queued", "downloading", "analyzing", "upload_queued", "uploading")
STATUSES = IN_PROGRESS + ("review", "uploaded", "failed", "duplicate", "interrupted")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS videos (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    shortcode       TEXT NOT NULL UNIQUE,
    source_url      TEXT NOT NULL,
    status          TEXT NOT NULL,
    auto_upload     INTEGER NOT NULL DEFAULT 1,
    privacy         TEXT NOT NULL DEFAULT 'private',
    file_path       TEXT,
    file_sha256     TEXT,
    ig_caption      TEXT,
    ig_uploader     TEXT,
    duration        REAL,
    is_asmr         INTEGER,
    asmr_confidence TEXT,
    asmr_triggers   TEXT,
    ai_summary      TEXT,
    title           TEXT,
    description     TEXT,
    tags            TEXT,
    youtube_id      TEXT,
    progress        INTEGER NOT NULL DEFAULT 0,
    error           TEXT,
    duplicate_of    INTEGER,
    duplicate_hits  INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    uploaded_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_videos_sha ON videos(file_sha256);
CREATE UNIQUE INDEX IF NOT EXISTS idx_videos_youtube ON videos(youtube_id) WHERE youtube_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS youtube_channels (
    channel_id      TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    custom_url      TEXT,
    thumbnail_url   TEXT,
    token_json      TEXT NOT NULL,
    is_active       INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
"""

_EDITABLE = {
    "status", "auto_upload", "privacy", "file_path", "file_sha256", "ig_caption",
    "ig_uploader", "duration", "is_asmr", "asmr_confidence", "asmr_triggers",
    "ai_summary", "title", "description", "tags", "youtube_id", "progress", "error",
    "duplicate_of", "uploaded_at", "channel_id", "channel_title",
}
_JSON_FIELDS = ("asmr_triggers", "tags")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Database:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self._conn() as conn:
            conn.executescript(_SCHEMA)
            cols = [r[1] for r in conn.execute("PRAGMA table_info(videos)").fetchall()]
            if "channel_id" not in cols:
                conn.execute("ALTER TABLE videos ADD COLUMN channel_id TEXT")
            if "channel_title" not in cols:
                conn.execute("ALTER TABLE videos ADD COLUMN channel_title TEXT")

    @contextmanager
    def _conn(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.path, timeout=30, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        try:
            yield conn
        finally:
            conn.close()

    # ---------- reading ----------
    @staticmethod
    def _row(row: sqlite3.Row | None) -> dict[str, Any] | None:
        if row is None:
            return None
        d = dict(row)
        for key in _JSON_FIELDS:
            d[key] = json.loads(d[key]) if d[key] else []
        d["is_asmr"] = None if d["is_asmr"] is None else bool(d["is_asmr"])
        d["auto_upload"] = bool(d["auto_upload"])
        return d

    def get(self, video_id: int) -> dict[str, Any] | None:
        with self._conn() as conn:
            return self._row(conn.execute("SELECT * FROM videos WHERE id = ?", (video_id,)).fetchone())

    def get_by_shortcode(self, shortcode: str) -> dict[str, Any] | None:
        with self._conn() as conn:
            return self._row(
                conn.execute("SELECT * FROM videos WHERE shortcode = ?", (shortcode,)).fetchone()
            )

    def list_all(self) -> list[dict[str, Any]]:
        with self._conn() as conn:
            rows = conn.execute("SELECT * FROM videos ORDER BY id DESC").fetchall()
        return [self._row(r) for r in rows]  # type: ignore[misc]

    def stats(self) -> dict[str, int]:
        with self._conn() as conn:
            counts = dict(conn.execute("SELECT status, COUNT(*) FROM videos GROUP BY status").fetchall())
            hits = conn.execute("SELECT COALESCE(SUM(duplicate_hits), 0) FROM videos").fetchone()[0]
        return {
            "total": sum(counts.values()),
            "uploaded": counts.get("uploaded", 0),
            "in_progress": sum(counts.get(s, 0) for s in IN_PROGRESS),
            "review": counts.get("review", 0),
            "failed": counts.get("failed", 0) + counts.get("interrupted", 0),
            # blocked = same link pasted again + same file found under a new link
            "duplicates_blocked": hits + counts.get("duplicate", 0),
        }

    def find_other_with_sha(self, sha256: str, exclude_id: int) -> dict[str, Any] | None:
        """An earlier video with the exact same file (ignores ones already marked duplicate)."""
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM videos WHERE file_sha256 = ? AND id != ? AND status != 'duplicate' "
                "ORDER BY id LIMIT 1",
                (sha256, exclude_id),
            ).fetchone()
        return self._row(row)

    # ---------- youtube channels ----------
    def list_channels(self) -> list[dict[str, Any]]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT channel_id, title, custom_url, thumbnail_url, is_active, created_at, updated_at "
                "FROM youtube_channels ORDER BY is_active DESC, updated_at DESC"
            ).fetchall()
        return [dict(r) for r in rows]

    def get_channel(self, channel_id: str) -> dict[str, Any] | None:
        with self._conn() as conn:
            row = conn.execute("SELECT * FROM youtube_channels WHERE channel_id = ?", (channel_id,)).fetchone()
            return dict(row) if row else None

    def get_active_channel(self) -> dict[str, Any] | None:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM youtube_channels WHERE is_active = 1 LIMIT 1"
            ).fetchone()
            if not row:
                row = conn.execute(
                    "SELECT * FROM youtube_channels ORDER BY updated_at DESC LIMIT 1"
                ).fetchone()
            return dict(row) if row else None

    def save_channel(self, channel_id: str, title: str, custom_url: str | None,
                     thumbnail_url: str | None, token_json: str, set_active: bool = False) -> None:
        ts = now_iso()
        with self._conn() as conn:
            existing = conn.execute("SELECT is_active FROM youtube_channels WHERE channel_id = ?", (channel_id,)).fetchone()
            has_any_active = conn.execute("SELECT 1 FROM youtube_channels WHERE is_active = 1").fetchone() is not None
            should_be_active = 1 if (set_active or not has_any_active or (existing and existing[0])) else 0
            if should_be_active:
                conn.execute("UPDATE youtube_channels SET is_active = 0")
            conn.execute(
                "INSERT INTO youtube_channels (channel_id, title, custom_url, thumbnail_url, token_json, is_active, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(channel_id) DO UPDATE SET title = excluded.title, custom_url = excluded.custom_url, "
                "thumbnail_url = excluded.thumbnail_url, token_json = excluded.token_json, is_active = excluded.is_active, updated_at = excluded.updated_at",
                (channel_id, title, custom_url, thumbnail_url, token_json, should_be_active, ts, ts),
            )

    def set_active_channel(self, channel_id: str) -> bool:
        ts = now_iso()
        with self._conn() as conn:
            ch = conn.execute("SELECT 1 FROM youtube_channels WHERE channel_id = ?", (channel_id,)).fetchone()
            if not ch:
                return False
            conn.execute("UPDATE youtube_channels SET is_active = 0")
            conn.execute("UPDATE youtube_channels SET is_active = 1, updated_at = ? WHERE channel_id = ?", (ts, channel_id))
            return True

    def update_channel_token(self, channel_id: str, token_json: str) -> None:
        ts = now_iso()
        with self._conn() as conn:
            conn.execute(
                "UPDATE youtube_channels SET token_json = ?, updated_at = ? WHERE channel_id = ?",
                (token_json, ts, channel_id),
            )

    def delete_channel(self, channel_id: str) -> None:
        with self._conn() as conn:
            was_active = conn.execute(
                "SELECT is_active FROM youtube_channels WHERE channel_id = ?", (channel_id,)
            ).fetchone()
            conn.execute("DELETE FROM youtube_channels WHERE channel_id = ?", (channel_id,))
            if was_active and was_active[0]:
                next_ch = conn.execute("SELECT channel_id FROM youtube_channels ORDER BY updated_at DESC LIMIT 1").fetchone()
                if next_ch:
                    conn.execute("UPDATE youtube_channels SET is_active = 1 WHERE channel_id = ?", (next_ch[0],))

    # ---------- writing ----------
    def add_link(self, shortcode: str, url: str, auto_upload: bool, privacy: str,
                 channel_id: str | None = None, channel_title: str | None = None) -> tuple[dict, bool]:
        """Returns (record, created). If the link was seen before, nothing new is created."""
        ts = now_iso()
        with self._conn() as conn:
            cur = conn.execute(
                "INSERT INTO videos (shortcode, source_url, status, auto_upload, privacy, channel_id, channel_title, created_at, updated_at) "
                "VALUES (?, ?, 'queued', ?, ?, ?, ?, ?, ?) ON CONFLICT(shortcode) DO NOTHING",
                (shortcode, url, int(auto_upload), privacy, channel_id, channel_title, ts, ts),
            )
            created = cur.rowcount == 1
            if not created:
                conn.execute(
                    "UPDATE videos SET duplicate_hits = duplicate_hits + 1 WHERE shortcode = ?",
                    (shortcode,),
                )
            row = conn.execute("SELECT * FROM videos WHERE shortcode = ?", (shortcode,)).fetchone()
        return self._row(row), created  # type: ignore[return-value]

    def update(self, video_id: int, **fields: Any) -> None:
        unknown = set(fields) - _EDITABLE
        if unknown:
            raise ValueError(f"Unknown fields: {unknown}")
        if "status" in fields and fields["status"] not in STATUSES:
            raise ValueError(f"Unknown status: {fields['status']}")
        for key in _JSON_FIELDS:
            if key in fields and fields[key] is not None:
                fields[key] = json.dumps(list(fields[key]))
        if "is_asmr" in fields and fields["is_asmr"] is not None:
            fields["is_asmr"] = int(bool(fields["is_asmr"]))
        if "auto_upload" in fields:
            fields["auto_upload"] = int(bool(fields["auto_upload"]))
        fields["updated_at"] = now_iso()
        cols = ", ".join(f"{k} = ?" for k in fields)
        with self._conn() as conn:
            conn.execute(f"UPDATE videos SET {cols} WHERE id = ?", (*fields.values(), video_id))

    def claim(self, video_id: int, from_statuses: tuple[str, ...], to_status: str, **fields: Any) -> bool:
        """Move to `to_status` only if the video is currently in one of `from_statuses`.

        Returns False if someone else already moved it - this is what makes a
        double-click on "Upload" harmless.
        """
        if to_status not in STATUSES:
            raise ValueError(f"Unknown status: {to_status}")
        sets = {"status": to_status, **fields, "updated_at": now_iso()}
        cols = ", ".join(f"{k} = ?" for k in sets)
        marks = ", ".join("?" for _ in from_statuses)
        with self._conn() as conn:
            cur = conn.execute(
                f"UPDATE videos SET {cols} WHERE id = ? AND status IN ({marks})",
                (*sets.values(), video_id, *from_statuses),
            )
            return cur.rowcount == 1

    def delete(self, video_id: int) -> None:
        with self._conn() as conn:
            conn.execute("DELETE FROM videos WHERE id = ?", (video_id,))

    def recover_after_restart(self) -> list[tuple[str, int]]:
        """Called at start-up. Returns the jobs that should be put back in the queue."""
        with self._conn() as conn:
            # An upload that was running when the app stopped may or may not have
            # reached YouTube. Never re-upload automatically - ask the admin.
            conn.execute(
                "UPDATE videos SET status = 'interrupted', error = ?, updated_at = ? WHERE status = 'uploading'",
                ("The app stopped during upload. Check your YouTube channel before retrying.", now_iso()),
            )
            conn.execute(
                "UPDATE videos SET status = 'queued', updated_at = ? WHERE status IN ('downloading', 'analyzing')",
                (now_iso(),),
            )
            rows = conn.execute(
                "SELECT id, status FROM videos WHERE status IN ('queued', 'upload_queued') ORDER BY id"
            ).fetchall()
        return [("upload" if r["status"] == "upload_queued" else "process", r["id"]) for r in rows]
