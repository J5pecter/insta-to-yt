"""Shared test helpers: fake Instagram, fake AI and fake YouTube (no internet needed)."""
from __future__ import annotations

from pathlib import Path

import pytest

from app.analyzer import AnalysisFailed, VideoMeta
from app.config import Settings
from app.db import Database
from app.downloader import Downloaded
from app.pipeline import Pipeline
from app.youtube import YouTubeError


class FakeYouTube:
    configured = True

    def __init__(self, connected: bool = True):
        self.connected = connected
        self.uploads: list[dict] = []
        self.fail_next = 0

    def upload(self, path, title, description, tags, privacy, progress=None):
        assert Path(path).exists()
        if self.fail_next:
            self.fail_next -= 1
            raise YouTubeError("Today's YouTube API limit is used up.")
        self.uploads.append(dict(path=path, title=title, description=description, tags=tags, privacy=privacy))
        if progress:
            progress(100)
        return f"YT{len(self.uploads):09d}"  # 11 characters, like a real YouTube ID

    def channel(self):
        return ("UC_test", "Test ASMR Channel")

    def disconnect(self):
        self.connected = False

    def start_sign_in(self):
        return "https://accounts.google.com/o/oauth2/auth?fake=1"


class FakeInstagram:
    """Each shortcode maps to file bytes. Same bytes = same video file."""

    def __init__(self):
        self.files: dict[str, bytes] = {}
        self.fail: set[str] = set()
        self.calls: list[str] = []
        self.caption = "Soap cutting so satisfying #asmr #soap"

    def __call__(self, url: str, shortcode: str, settings: Settings) -> Downloaded:
        self.calls.append(shortcode)
        if shortcode in self.fail:
            raise RuntimeError("Instagram did not allow the download.")
        settings.downloads_dir.mkdir(parents=True, exist_ok=True)
        path = settings.downloads_dir / f"{shortcode}.mp4"
        path.write_bytes(self.files.get(shortcode, f"video-{shortcode}".encode()))
        hashtags = [w for w in self.caption.split() if w.startswith("#")]
        return Downloaded(path=path, caption=self.caption, uploader="soapmaker",
                          duration=30.0, width=1080, height=1920, hashtags=hashtags)


class FakeAI:
    def __init__(self):
        self.is_asmr = True
        self.fail = False
        self.calls = 0

    def __call__(self, frames, dl, settings) -> VideoMeta:
        self.calls += 1
        if self.fail:
            raise AnalysisFailed("The AI is busy (rate limit).")
        return VideoMeta(
            title="ASMR Soap Cutting <Crunchy> Cubes",
            description="Relax with crunchy soap cubes.",
            tags=["asmr", "soap cutting", "#satisfying"],
            hashtags=["#soapcutting"],
            is_asmr=self.is_asmr,
            confidence="high",
            triggers=["soap cutting", "crunching"],
            summary="Hands cut a block of soap into small cubes.",
        )


def fake_frames(video: Path, out_dir: Path, duration, count: int = 6, width: int = 768):
    out_dir.mkdir(parents=True, exist_ok=True)
    frame = out_dir / "frame_00.jpg"
    frame.write_bytes(b"\xff\xd8fake-jpeg")
    return [frame]


def make_settings(tmp_path: Path, **overrides) -> Settings:
    values = dict(
        data_dir=tmp_path / "data",
        admin_password="test-password-123",
        session_secret="test-session-secret-0123456789abcdef",
        ai_provider="claude",
        default_hashtags=["#asmr"],
        description_footer="Subscribe for more.",
    )
    values.update(overrides)
    s = Settings(**values)
    s.ensure_dirs()
    return s


class Harness:
    def __init__(self, tmp_path: Path, **settings_overrides):
        self.settings = make_settings(tmp_path, **settings_overrides)
        self.db = Database(self.settings.db_path)
        self.youtube = FakeYouTube()
        self.instagram = FakeInstagram()
        self.ai = FakeAI()
        self.pipeline = Pipeline(self.settings, self.db, self.youtube, download=self.instagram,
                                 analyze=self.ai, frames=fake_frames)

    def add(self, shortcode: str, auto_upload: bool = True) -> int:
        video, created = self.db.add_link(shortcode, f"https://www.instagram.com/reel/{shortcode}/",
                                          auto_upload, "private")
        if created:
            self.pipeline.enqueue("process", video["id"])
        return video["id"]

    def drain(self) -> None:
        """Run every waiting job right now (the real app does this in a background thread)."""
        q = self.pipeline._queue
        while not q.empty():
            job = q.get_nowait()
            if job:
                self.pipeline.run_job(*job)


@pytest.fixture
def harness(tmp_path):
    return Harness(tmp_path)
