# Insta → YouTube · Task-by-Task Video Uploader

[![GitHub Pages](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-7c5cff?style=flat&logo=github)](https://j5pecter.github.io/insta-to-yt/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

🌐 **Live Web Portal**: [https://j5pecter.github.io/insta-to-yt/](https://j5pecter.github.io/insta-to-yt/)

Paste an Instagram video or reel link into the portal. The service downloads the video **temporarily**, extracts and formats the title, description and hashtags, and uploads it to **your currently selected YouTube channel** on a **task-by-task, one-on-one** basis. Once the upload finishes, the temporary downloaded file is **automatically deleted**.

Every processed link and video fingerprint is recorded so duplicates are never uploaded twice.

```
 You paste an Instagram link
        │
        ▼
 ① Check the link ── already recorded? ──► "Already on YouTube" (skipped)
        │ new task
        ▼
 ② Temporary Download (yt-dlp) to data/downloads/
        │
        ▼
 ③ Video Fingerprint (SHA-256) ── same video seen before? ──► "Duplicate – skipped" & temp file deleted
        │ unique
        ▼
 ④ Metadata Preparation (Title, Description, Tags, #Shorts if vertical)
        │
        ▼
 ⑤ Upload to Selected YouTube Channel ──► "On YouTube" + direct link
        │
        ▼
 ⑥ Temporary File Cleanup ──► Video file in data/downloads/ is deleted immediately
```

---

## Quick Start (Under 5 Minutes)

### 1. Start the app
Double-click **`start.bat`** (or run `.venv\Scripts\python -m app`).
- The portal opens in your browser at <http://localhost:8000>.
- Log in with password: **`admin1234`** (change `ADMIN_PASSWORD` in `.env` anytime).

### 2. Connect your YouTube Channel(s)
1. In Google Cloud Console (<https://console.cloud.google.com>):
   - Enable **YouTube Data API v3**.
   - Create an **OAuth 2.0 Web Client ID** with redirect URI: `http://localhost:8000/youtube/callback`.
   - Download the JSON credentials.
2. In the portal:
   - Either paste the JSON content / upload file directly in the **YouTube API Setup** section, or place it as `data/client_secret.json`.
   - Click **Connect YouTube** in the top bar. Sign in with the Google account that manages your channel.
   - You can connect **multiple channels** and easily switch the currently selected channel with 1 click!

### 3. Upload Videos Task by Task
1. Paste one or more Instagram reel or video links (one per line).
2. Choose your target channel (defaults to the currently selected channel).
3. Select privacy (`Private`, `Unlisted`, or `Public`).
4. Click **Add to queue**.
5. The service processes your tasks one by one:
   - Downloads the video temporarily.
   - Uploads to the selected channel.
   - Deletes the temporary video file immediately.
   - Displays a clickable **▶ YouTube** link when done!

---

## Daily use

1. Paste one or more Instagram links (one per line).
2. Choose privacy (Private / Unlisted / Public) and whether to upload automatically.
3. Tick **"I own these videos or have the creator's permission"** and press **Add to queue**.
4. Watch the list. Keep the black `start.bat` window open; closing it stops the app.

| Status | Meaning | What you do |
|---|---|---|
| Waiting / Downloading / AI checking | Working on it | Nothing |
| Needs your review | Auto-upload was off, caption empty, or YouTube channel not connected | Press **Review & upload**, check title/description, press **Upload to YouTube** |
| Uploading 45% | Sending to YouTube | Nothing |
| On YouTube | Done. Press **▶ YouTube** to open it | Nothing |
| Failed | Something went wrong (reason shown) | Press **Retry** |
| Duplicate – skipped | The exact same video file was already processed under another link | Nothing |
| Interrupted | The app was closed during an upload | Check your channel first. If the video isn't there, press **Retry**; if it is, press **Mark done** and paste its link |

### How double uploads are prevented
1. **Same link:** every Instagram post code is stored once. Pasting it again (even with a different
   `?igsh=` ending, or as `/reels/` instead of `/reel/`) is blocked and shows the existing YouTube link.
2. **Same video, different link:** after download, the file's fingerprint (SHA-256) is compared with
   every earlier video.
3. **Double-clicks and crashes:** an upload can only start once per video. If the app stops mid-upload,
   it never re-uploads by itself; it asks you to check first.
4. Uploaded videos can't be deleted from the record book, so the protection is permanent.

The record book is `data/app.db`. **Back it up** now and then.

---

## Running it for free

| Part | Cost |
|---|---|
| This app, Python, yt-dlp, ffmpeg, Ollama | Free (open source) |
| Google Cloud + YouTube Data API | Free. No credit card or billing account needed (don't add one) |
| Running on your own PC | Free |
| Claude AI (`AI_PROVIDER=claude`) | **Optional, paid per use.** Roughly a few cents per video with `claude-opus-5-5`, a fraction of a cent with `claude-haiku-5-5` (rough estimates; your Anthropic console shows the real usage) |

Pick who checks the videos with `AI_PROVIDER` in `.env`:

| `AI_PROVIDER` | Cost | Sees the video? | Speed | Title quality |
|---|---|---|---|---|
| `free` | Free | No, reads caption + hashtags only | Instant | Template-based |
| `local` | Free | Yes (4 moments in one picture) | About 1-3 minutes per video on a GTX 1650 | Good, but can imagine details |
| `claude` | Paid | Yes (6 pictures) | ~10-20 s | Best |

### Free mode (`AI_PROVIDER=free`)
- ASMR is guessed from the caption and hashtags (`#asmr`, soap, slime, kinetic sand, tapping,
  satisfying…). Titles come from templates plus the caption, e.g. *"ASMR Soap Cutting | Crunchy soap cubes"*.
- Videos still upload automatically. A video with **no** ASMR words waits for your review
  (set `HOLD_NON_ASMR=false` to upload those too).

### Free local AI (`AI_PROVIDER=local`)
A small AI model runs on your own computer through **Ollama**. It's private, free, and works offline.
1. Install **Ollama** from <https://ollama.com/download> (Windows installer, about 1.6 GB).
   It then runs in the background (llama icon near the clock).
2. Double-click **`setup_local_ai.bat`**. It downloads the model (`gemma3:4b`, about 3 GB, one time).
3. In `.env`, set `AI_PROVIDER=local` and restart `start.bat`. The top bar shows **Local AI** in green.

Tips for computers like a GTX 1650 (4 GB) with 8 GB RAM:
- Each video takes about 1-3 minutes (measured on a GTX 1650), and the PC is busy meanwhile. Videos are
  handled one at a time, so just let the queue run.
- Close Chrome and games while it works. If you see "ran out of memory" or it's too slow, set
  `LOCAL_AI_MODEL=qwen3-vl:2b` in `.env`, run `setup_local_ai.bat` again, and restart.
- If the caption literally says "ASMR", that wins over a doubtful local AI answer.
- If Ollama isn't running, videos wait for your review with the reason shown; nothing is lost.

---

## Important YouTube rules (please read)

- **New Google projects can only upload as Private.** Google locks videos uploaded through the API to
  *private* until your project passes Google's API audit. You can still make each video public by hand
  in YouTube Studio. To lift the lock, apply through Google's
  [YouTube API audit and quota extension form](https://support.google.com/youtube/contact/yt_api_form).
- **Daily limit.** Each Google project gets 10,000 API "units" per day. Check the current cost of an
  upload in **Google Cloud → APIs & Services → YouTube Data API v3 → Quotas**. When the limit is reached,
  the video shows "Failed: Today's YouTube API limit is used up". Press **Retry** the next day.
- **Copyright.** Only upload videos you made or have written permission to repost. Re-uploading
  other creators' clips can get copyright strikes, and YouTube's "reused content" rule can block
  monetisation. The "Original: … (by @account)" credit line is not permission.

---

## When Instagram asks for a login

Instagram sometimes blocks downloads from scripts. Try these in order:

1. Double-click **`update.bat`** (Instagram changes often, and updates usually fix it).
2. Log in to Instagram in **Firefox**, then set `INSTAGRAM_COOKIES_FROM_BROWSER=firefox` in `.env`
   and restart. (Chrome on Windows doesn't allow this.)
3. Or export a `cookies.txt` file from your browser while logged in and set
   `INSTAGRAM_COOKIES_FILE=data/cookies.txt`.

Tip: use a spare Instagram account for this, as heavy downloading can get an account rate-limited.
Keep cookie files private, because they work like a password.

---

## Settings (`.env`)

| Setting | What it does |
|---|---|
| `ADMIN_PASSWORD` | Password for the dashboard |
| `AI_PROVIDER` | `free`, `local` or `claude` (see "Running it for free") |
| `LOCAL_AI_MODEL` | Local AI model for Ollama (default `gemma3:4b`) |
| `ANTHROPIC_API_KEY` / `CLAUDE_MODEL` | Paid AI key and model (default `claude-opus-5-5`) |
| `DEFAULT_PRIVACY` | `private`, `unlisted` or `public` |
| `AUTO_UPLOAD` | `true` = upload as soon as ready, `false` = always wait for you |
| `HOLD_NON_ASMR` | `true` = videos the AI thinks aren't ASMR wait for you |
| `INCLUDE_SOURCE_CREDIT` | Adds the Instagram link and @account to the description |
| `CHANNEL_NAME`, `DEFAULT_HASHTAGS`, `DESCRIPTION_FOOTER` | Your channel's style |
| `YOUTUBE_CATEGORY_ID` | 24 = Entertainment, 22 = People & Blogs |
| `KEEP_DOWNLOADS` | Keep video files after upload (default: delete them) |

The app only runs while your computer is on and `start.bat` is open. It's reachable only from this
computer (`127.0.0.1`).

---

## For developers

```
app/
  links.py       Instagram/YouTube link checking (only real post links are accepted)
  db.py          SQLite record book, duplicate rules, safe status "claims"
  downloader.py  yt-dlp download (bundled ffmpeg via imageio-ffmpeg)
  media.py       SHA-256 fingerprint, still frames
  analyzer.py    Claude: ASMR check + title/description/tags (structured JSON output)
  free_mode.py   No-AI mode: keyword ASMR guess + template text (also the AI fallback)
  local_ai.py    Free local AI via Ollama (2x2 frame grid, JSON-schema output)
  meta.py        YouTube limits (title 100 chars, description 5000 bytes, tags 500 chars)
  youtube.py     Google sign-in + resumable upload
  pipeline.py    Background worker: download → dedupe → AI → review/upload
  main.py        FastAPI app, admin login, API
web/             Dashboard (plain HTML/CSS/JS, no build step)
tests/           pytest (fake Instagram, AI and YouTube; real ffmpeg)
```

Run the tests:

```bash
.venv\Scripts\python -m pytest
```

UI preview with throwaway settings: `.venv\Scripts\python -m app --env-file tests/preview.env`
(opens on port 8765 and stores data in `.preview-data/`).

Ideas for later: run on a small always-on server (needs HTTPS and a public redirect URI),
scheduled publishing (`publishAt`), playlists, audio transcription,
perceptual hashing to catch re-encoded copies.

---

## Contributing

Contributions, bug reports, and feature requests are welcome!
1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is open source and available under the [MIT License](LICENSE).

