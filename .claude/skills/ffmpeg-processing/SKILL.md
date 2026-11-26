---
name: ffmpeg-processing
description: Video conversion, probing, thumbnail extraction, and optimization using FFmpeg.
---

# FFmpeg Processing Skill

## Purpose
Orchestrate local FFmpeg/FFprobe operations safely for vertical video optimization and thumbnail generation.

## Applicable Tasks
- Probing video container, streams, duration, resolution, codecs, and rotation.
- Converting to vertical 9:16 (1080x1920) H.264/AAC MP4 with faststart.
- Generating contact sheets, multi-frame thumbnails, and custom frame extraction.

## Implementation Rules
- Always invoke FFmpeg using safe argument lists (subprocess with array arguments).
- Never interpolate user input directly into shell commands.
- Use -movflags +faststart for web-streamable MP4 outputs.

## Required Validation
- Verify probe data correctly extracts aspect ratio, duration, and audio presence.
- Ensure output files are valid non-empty video files with valid headers.

## Prohibited Practices
- Never stretch non-vertical video to fill 9:16 frame; use fit-with-blur or center-crop.
- Never upscale low-quality content and label it genuine HD.

## Completion Criteria
- Video processing completes cleanly without command injection risks.
