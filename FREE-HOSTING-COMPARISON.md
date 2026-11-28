# SocialRelay V5 — Free Cloud Hosting Comparison

| Provider | Free Tier Allowance | Persistent Storage | Serverless / Scheduled Jobs | Verdict |
|---|---|---|---|---|
| **GitHub Pages** | Free static site hosting | N/A (static SPA) | N/A (via GitHub Actions) | **Selected (Frontend SPA)** |
| **Supabase Free Plan** | 500 MB PostgreSQL, 1 GB Storage (50 MB max file), 500k Edge Function invocations/mo | Yes (Private Storage + PostgreSQL) | Yes (Edge Functions + Queues + Cron) | **Selected (Primary Cloud Backend)** |
| **Render Free** | 512 MB RAM web service | No (ephemeral) | Sleeps after 15 min idle | **Not Recommended** |
| **Cloudflare Workers** | 100k req/day | D1 / R2 | Supporting edge only | **Alternative** |
| **Google Cloud Free** | `e2-micro` VM | 30 GB | Tight egress limits | **Alternative VM** |

> [!NOTE]
> Free-tier plans are subject to provider terms and inactivity pause policies (Supabase Free projects pause after 7 days of inactivity). Never send artificial traffic to evade inactivity policies.
