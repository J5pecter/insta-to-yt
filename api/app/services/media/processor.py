"""FFmpeg and FFprobe video processing pipeline for SocialRelay.
Safe subprocess execution using argument arrays to prevent command injection.
"""
from __future__ import annotations

import logging
import math
import re
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional

import imageio_ffmpeg

from ...core.config import settings

logger = logging.getLogger("socialrelay.media")
FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()


class MediaProcessingError(RuntimeError):
    pass


class VideoProcessor:
    def __init__(self, ffmpeg_bin: str = FFMPEG_EXE):
        self.ffmpeg = ffmpeg_bin

    def probe_video(self, video_path: Path) -> Dict[str, Any]:
        """Inspect video streams, container metadata, duration, aspect ratio, and codecs."""
        if not video_path.exists() or video_path.stat().st_size == 0:
            raise MediaProcessingError(f"Video file does not exist or is empty: {video_path}")

        # Run ffmpeg -i to dump stream info
        cmd = [self.ffmpeg, "-hide_banner", "-i", str(video_path)]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, errors="replace")
        err = res.stderr

        info: Dict[str, Any] = {
            "duration": None,
            "width": None,
            "height": None,
            "fps": None,
            "video_codec": None,
            "audio_codec": None,
            "bitrate": None,
            "rotation": 0,
            "is_vertical": False,
            "aspect_ratio": "unknown",
            "file_size": video_path.stat().st_size,
        }

        # Duration and bitrate extraction
        # e.g.: Duration: 00:00:28.45, start: 0.000000, bitrate: 1245 kb/s
        dur_match = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", err)
        if dur_match:
            hours, minutes, seconds = dur_match.groups()
            info["duration"] = round(int(hours) * 3600 + int(minutes) * 60 + float(seconds), 2)
        else:
            try:
                _, secs = imageio_ffmpeg.count_frames_and_secs(str(video_path))
                info["duration"] = round(float(secs), 2)
            except Exception:
                pass

        br_match = re.search(r"bitrate:\s*(\d+)\s*kb/s", err)
        if br_match:
            info["bitrate"] = int(br_match.group(1)) * 1000

        # Video stream extraction
        # e.g.: Stream #0:0(und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709), 1080x1920 [SAR 1:1 DAR 9:16], 29.97 fps
        v_match = re.search(r"Stream #\d+:\d+.*?: Video: ([^,\s]+).*?,\s*(\d+)x(\d+)", err)
        if v_match:
            info["video_codec"] = v_match.group(1).lower()
            width = int(v_match.group(2))
            height = int(v_match.group(3))
            info["width"] = width
            info["height"] = height
            info["is_vertical"] = height >= width

            # Calculate simplified aspect ratio
            gcd = math.gcd(width, height)
            info["aspect_ratio"] = f"{width // gcd}:{height // gcd}"

        # FPS extraction
        fps_match = re.search(r"(\d+(?:\.\d+)?)\s*fps", err)
        if fps_match:
            info["fps"] = float(fps_match.group(1))

        # Audio stream extraction
        # e.g.: Stream #0:1(und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo
        a_match = re.search(r"Stream #\d+:\d+.*?: Audio: ([^,\s]+)", err)
        if a_match:
            info["audio_codec"] = a_match.group(1).lower()

        # Rotation check (e.g. rotation of -90.00 degrees)
        rot_match = re.search(r"rotate\s*:\s*(-?\d+)", err)
        if rot_match:
            info["rotation"] = int(rot_match.group(1))

        return info

    def extract_single_thumbnail(
        self,
        video_path: Path,
        output_path: Path,
        timestamp: float = 1.0,
        width: int = 1080,
    ) -> Path:
        """Extract a single high-quality JPEG thumbnail at specified timestamp."""
        output_path.parent.mkdir(parents=True, exist_ok=True)
        probe = self.probe_video(video_path)
        duration = probe.get("duration") or 2.0
        safe_time = min(max(0.1, timestamp), max(0.1, duration - 0.5))

        cmd = [
            self.ffmpeg,
            "-v", "error",
            "-y",
            "-ss", f"{safe_time:.2f}",
            "-i", str(video_path),
            "-frames:v", "1",
            "-vf", f"scale={width}:-2",
            "-q:v", "3",
            str(output_path),
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if res.returncode != 0 or not output_path.exists() or output_path.stat().st_size == 0:
            # Fallback to time 0.0
            cmd_fallback = [
                self.ffmpeg,
                "-v", "error",
                "-y",
                "-ss", "0.0",
                "-i", str(video_path),
                "-frames:v", "1",
                "-q:v", "3",
                str(output_path),
            ]
            subprocess.run(cmd_fallback, capture_output=True, timeout=120)

        if not output_path.exists() or output_path.stat().st_size == 0:
            raise MediaProcessingError("Could not extract thumbnail from video.")
        return output_path

    def extract_multi_thumbnails(
        self,
        video_path: Path,
        output_dir: Path,
        count: int = 6,
        width: int = 720,
    ) -> List[Path]:
        """Extract multiple evenly spaced thumbnail candidate frames."""
        output_dir.mkdir(parents=True, exist_ok=True)
        probe = self.probe_video(video_path)
        duration = probe.get("duration") or 3.0

        times = [duration * (i + 0.5) / count for i in range(count)] if duration > 0 else [0.0]
        extracted: List[Path] = []

        for i, t in enumerate(times):
            frame_path = output_dir / f"frame_{i:02d}.jpg"
            cmd = [
                self.ffmpeg,
                "-v", "error",
                "-y",
                "-ss", f"{t:.2f}",
                "-i", str(video_path),
                "-frames:v", "1",
                "-vf", f"scale={width}:-2",
                "-q:v", "4",
                str(frame_path),
            ]
            res = subprocess.run(cmd, capture_output=True, timeout=60)
            if res.returncode == 0 and frame_path.exists() and frame_path.stat().st_size > 0:
                extracted.append(frame_path)

        if not extracted:
            raise MediaProcessingError("Failed to extract thumbnail candidates.")
        return extracted

    def optimize_video(
        self,
        input_path: Path,
        output_path: Path,
        profile: str = "vertical_9_16",
        crop_mode: str = "fit_blur",
        trim_start: Optional[float] = None,
        trim_end: Optional[float] = None,
        mute: bool = False,
        audio_replace_path: Optional[Path] = None,
    ) -> Path:
        """Process, re-encode, or crop video according to destination platform profiles."""
        output_path.parent.mkdir(parents=True, exist_ok=True)
        probe = self.probe_video(input_path)
        is_vertical = probe.get("is_vertical", False)

        cmd = [self.ffmpeg, "-v", "error", "-y"]

        # Trimming flags
        if trim_start is not None and trim_start > 0:
            cmd.extend(["-ss", f"{trim_start:.2f}"])
        if trim_end is not None and trim_end > 0:
            cmd.extend(["-to", f"{trim_end:.2f}"])

        cmd.extend(["-i", str(input_path)])

        if audio_replace_path and audio_replace_path.exists():
            cmd.extend(["-i", str(audio_replace_path)])

        # Construct video filter graph
        filter_complex: Optional[str] = None
        vf_args: List[str] = []

        if profile == "vertical_9_16":
            if is_vertical:
                # Video is already vertical, scale cleanly to 1080x1920 keeping aspect ratio
                vf_args.append("scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2")
            else:
                # Video is horizontal or square
                if crop_mode == "center_crop":
                    # Crop to 9:16 aspect ratio
                    vf_args.append("crop=ih*9/16:ih:(iw-ow)/2:0,scale=1080:1920")
                elif crop_mode == "fit_blur":
                    # Modern blurred background + sharp centered foreground
                    filter_complex = (
                        "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:5[bg];"
                        "[0:v]scale=1080:1920:force_original_aspect_ratio=decrease[fg];"
                        "[bg][fg]overlay=(W-w)/2:(H-h)/2[v]"
                    )
                else:
                    # fit black borders
                    vf_args.append("scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black")
        else:
            # Original profile: ensure even dimensions for H.264
            vf_args.append("scale=trunc(iw/2)*2:trunc(ih/2)*2")

        if filter_complex:
            cmd.extend(["-filter_complex", filter_complex, "-map", "[v]"])
        elif vf_args:
            cmd.extend(["-vf", ",".join(vf_args)])

        # Audio mapping
        if mute:
            cmd.append("-an")
        elif audio_replace_path and audio_replace_path.exists():
            cmd.extend(["-map", "1:a:0", "-c:a", "aac", "-b:a", "192k"])
        else:
            if probe.get("audio_codec"):
                cmd.extend(["-c:a", "aac", "-b:a", "192k", "-ar", "44100"])
            else:
                cmd.append("-an")

        # Standard web-optimized H.264 settings
        cmd.extend([
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "22",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            str(output_path),
        ])

        logger.info(f"Running FFmpeg optimization: {' '.join(cmd)}")
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if res.returncode != 0 or not output_path.exists() or output_path.stat().st_size == 0:
            raise MediaProcessingError(f"Video optimization failed (exit code {res.returncode}): {res.stderr}")

        return output_path


video_processor = VideoProcessor()
