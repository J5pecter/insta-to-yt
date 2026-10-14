"""Uses the real bundled ffmpeg on a tiny generated video."""
import subprocess

import pytest

from app.media import FFMPEG, duration_seconds, extract_frames, sha256_file


@pytest.fixture(scope="module")
def sample_video(tmp_path_factory):
    path = tmp_path_factory.mktemp("media") / "sample.mp4"
    subprocess.run(
        [FFMPEG, "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=360x640:rate=25:duration=3",
         "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-shortest",
         "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", str(path)],
        check=True, capture_output=True, timeout=120,
    )
    return path


def test_duration(sample_video):
    assert duration_seconds(sample_video) == pytest.approx(3.0, abs=0.2)


def test_frames(sample_video, tmp_path):
    frames = extract_frames(sample_video, tmp_path / "frames", duration=None, count=6)
    assert len(frames) == 6
    assert all(f.stat().st_size > 1000 for f in frames)
    assert frames[0].read_bytes()[:2] == b"\xff\xd8"  # JPEG


def test_fingerprint_is_stable(sample_video, tmp_path):
    copy = tmp_path / "copy.mp4"
    copy.write_bytes(sample_video.read_bytes())
    assert sha256_file(sample_video) == sha256_file(copy)
    assert len(sha256_file(sample_video)) == 64


def test_contact_sheet_is_a_2x2_grid(sample_video, tmp_path):
    import re
    from app.media import make_contact_sheet

    frames = extract_frames(sample_video, tmp_path / "f", duration=None, count=4, width=180)
    sheet = make_contact_sheet(frames, tmp_path / "grid.jpg")
    info = subprocess.run([FFMPEG, "-i", str(sheet)], capture_output=True, text=True).stderr
    w, h = map(int, re.search(r", (\d+)x(\d+)", info).groups())
    assert (w, h) == (360, 640)  # two 180x320 frames across, two down
