# SocialRelay v1.0.0 — YouTube Data API v3 Setup Guide

This guide walks through configuring official Google Cloud Console access to automatically publish YouTube Shorts and long-form videos from SocialRelay using official Google OAuth 2.0 and the YouTube Data API v3.

---

## 1. Prerequisites

- A Google Account that owns or manages a YouTube channel.
- Access to the [Google Cloud Console](https://console.cloud.google.com/).

---

## 2. Google Cloud Project Setup

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. In the top project selector dropdown, click **New Project**.
3. Name the project `SocialRelay-Publisher` and click **Create**.
4. Make sure your newly created project is selected in the top bar.

---

## 3. Enable YouTube Data API v3

1. In the left navigation menu, go to **APIs & Services > Library**.
2. In the search box, type `YouTube Data API v3`.
3. Click on the result and click **Enable**.

---

## 4. Configure OAuth Consent Screen

1. In the left menu, select **APIs & Services > OAuth consent screen**.
2. Select **External** user type (allows connection to any personal or brand Google account) and click **Create**.
3. **App Information**:
   - **App name**: `SocialRelay`
   - **User support email**: Your personal email
   - **Developer contact information**: Your personal email
4. Click **Save and Continue**.
5. **Scopes**:
   - Click **Add or Remove Scopes**.
   - In the filter, search for `youtube`.
   - Select the following scopes:
     - `https://www.googleapis.com/auth/youtube.upload` (Upload YouTube videos)
     - `https://www.googleapis.com/auth/youtube.readonly` (Verify channel title and upload status)
   - Click **Update** then **Save and Continue**.
6. **Test Users**:
   - Click **Add Users**.
   - Enter your Gmail address (the one associated with your YouTube Channel).
   - *Note: While in "Testing" mode, only accounts listed here can connect. This provides complete security without needing Google app verification!*
7. Click **Save and Continue** and finish the wizard.

---

## 5. Create OAuth 2.0 Credentials

1. In the left menu, select **APIs & Services > Credentials**.
2. Click **Create Credentials** at the top and select **OAuth client ID**.
3. Under **Application type**, choose **Web application**.
4. **Name**: `SocialRelay Client`
5. Under **Authorized redirect URIs**, click **Add URI** and enter:
   ```
   http://localhost:8000/api/v1/accounts/youtube/callback
   ```
   *(If deploying with a domain or reverse proxy, also add `https://relay.yourdomain.com/api/v1/accounts/youtube/callback`)*
6. Click **Create**.
7. Copy the **Client ID** and **Client Secret**.

---

## 6. Configure SocialRelay

Open your `.env` file in the project root and enter your credentials:
```env
YOUTUBE_CLIENT_ID=your_client_id.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=your_client_secret
YOUTUBE_REDIRECT_URI=http://localhost:8000/api/v1/accounts/youtube/callback
```

---

## 7. Understanding YouTube API Quotas

Google provides a generous **free daily quota of 10,000 units** for every Google Cloud project.

### Quota Consumption Breakdown:
| API Method | Operation | Quota Cost |
|---|---|---|
| `videos.insert` | Uploading a video (Shorts or Long) | **1,600 units** |
| `videos.list` | Querying video processing status | **1 unit** |
| `channels.list` | Fetching connected channel info | **1 unit** |

### Maximum Daily Free Uploads:
$$\text{Max Uploads per Day} = \left\lfloor \frac{10,000 \text{ units}}{1,600 \text{ units/upload}} \right\rfloor = \mathbf{6 \text{ videos per day}}$$

### Quota Reset Schedule:
- The daily quota resets automatically every day at **Midnight Pacific Time** (00:00 PST / 08:00 UTC / 13:30 IST).
- If your publishing schedule exceeds 6 videos in a single 24-hour cycle, SocialRelay's job queue automatically pauses subsequent uploads, preserves the jobs, and resumes once the daily quota resets.

---

## 8. Resumable Video Upload Architecture

SocialRelay implements Google's **Resumable Upload Protocol** in [adapter.py](file:///d:/Claude%20Apps/Insta%20to%20YT/api/app/providers/youtube/adapter.py):
1. An initial metadata call initiates a resumable session with Google servers, yielding an upload URI.
2. The video is transmitted in **5 MB byte chunks** (`PUT` with `Content-Range: bytes start-end/total`).
3. If an internet hiccup or brief disconnection occurs midway through uploading a 50MB video, SocialRelay queries the byte offset acknowledged by YouTube and resumes seamlessly without re-uploading from byte 0.
