# SocialRelay V4 — GitHub Pages Frontend Deployment

The SocialRelay React frontend is automatically built and deployed to GitHub Pages via [.github/workflows/deploy.yml](file:///d:/Claude%20Apps/Insta%20to%20YT/.github/workflows/deploy.yml).

## Live URL
- **GitHub Pages**: `https://j5pecter.github.io/insta-to-yt/`

## Connecting GitHub Pages to Your Cloud Backend
1. Deploy your backend on your cloud VM (see [ORACLE-CLOUD-DEPLOYMENT.md](file:///d:/Claude%20Apps/Insta%20to%20YT/ORACLE-CLOUD-DEPLOYMENT.md)).
2. In your GitHub repository **Settings → Secrets and variables → Actions → Variables**, add:
   - `VITE_API_BASE_URL` = `https://your-cloud-domain/api/v1` (public API URL only—never secrets!).
3. On your cloud server's `.env.production`, include `https://j5pecter.github.io` in `ALLOWED_ORIGINS`.
4. Re-run the **Deploy to GitHub Pages** workflow.

> [!TIP]
> For strict same-origin HttpOnly cookies without cross-site cookie restrictions, you can also access the built-in same-origin dashboard served directly by Caddy at `https://your-cloud-domain/`.
