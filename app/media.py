"""Video file helpers: fingerprint, length and still frames (uses a bundled ffmpeg)."""
from __future__ import annotations

import hashlib
import subprocess
from pathlib import Path

import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


class MediaError(RuntimeError):
    pass


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def duration_seconds(path: Path) -> float | None:
    try:
        return float(imageio_ffmpeg.count_frames_and_secs(str(path))[1])
    except Exception:
        return None


def extract_frames(video: Path, out_dir: Path, duration: float | None, count: int = 6,
                   width: int = 768) -> list[Path]:
    """Save `count` evenly spaced JPEG frames and return their paths."""
    out_dir.mkdir(parents=True, exist_ok=True)
    length = duration or duration_seconds(video) or 0.0
    if length <= 0:
        times = [0.0]
    else:
        times = [length * (i + 0.5) / count for i in range(count)]

    frames: list[Path] = []
    for i, t in enumerate(times):
        out = out_dir / f"frame_{i:02d}.jpg"
        result = subprocess.run(
            [FFMPEG, "-v", "error", "-y", "-ss", f"{t:.2f}", "-i", str(video),
             "-frames:v", "1", "-vf", f"scale={width}:-2", "-q:v", "4", str(out)],
            capture_output=True, timeout=120,
        )
        if result.returncode == 0 and out.exists() and out.stat().st_size > 0:
            frames.append(out)
    if not frames:
        raise MediaError("Could not read any picture from the video file.")
    return frames


def make_contact_sheet(frames: list[Path], out: Path) -> Path:
    """Put 4 frames into one 2x2 picture (time order: top-left, top-right, bottom-left, bottom-right).

    Small local AI models handle one picture far better than several.
    """
    if not frames:
        raise MediaError("No pictures to combine.")
    picks = (frames + [frames[-1]] * 4)[:4]  # too few? repeat the last one, keeping time order
    cmd = [FFMPEG, "-v", "error", "-y"]
    for f in picks:
        cmd += ["-i", str(f)]
    cmd += ["-filter_complex", "[0:v][1:v][2:v][3:v]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0[v]",
            "-map", "[v]", "-frames:v", "1", "-q:v", "4", str(out)]
    result = subprocess.run(cmd, capture_output=True, timeout=120)
    if result.returncode != 0 or not out.exists():
        raise MediaError("Could not combine the pictures for the local AI.")
    return out
