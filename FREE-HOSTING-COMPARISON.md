# SocialRelay V4 — Free Cloud Hosting Comparison

This comparison evaluates zero-cost cloud hosting options for running SocialRelay's frontend, backend, FFmpeg video processor, SQLite database, and persistent background automation workers without relying on a personal PC.

| Provider | Free Tier Allowance | Persistent Disk | Always-On Background Worker | FFmpeg ARM64 / x86 | Verdict |
|---|---|---|---|---|---|
| **Oracle Cloud Always Free** | 2–4 ARM64 OCPUs (`VM.Standard.A1.Flex`), up to 24 GB RAM, 200 GB block storage, 10 TB egress/mo | Yes (50–200 GB) | Yes | Yes | **Best Fit (Primary Backend)** |
| **GitHub Pages** | Free static site hosting | N/A (static) | No | No | **Best Fit (Frontend SPA)** |
| **Google Cloud Free Tier** | 1× `e2-micro` VM (0.25–2 vCPU shared, 1 GB RAM), 30 GB disk, 1 GB egress/mo | Yes | Limited (1 GB RAM) | Tight for 1080p | **Secondary Fallback** |
| **Northflank Sandbox** | 2 services, 0.5 vCPU / 512 MB RAM | Limited | Sandbox only | Limited | **Dev / Staging Only** |
| **Render Free** | 512 MB RAM web service | No (ephemeral) | Sleeps after 15 min idle | No persistent queue | **Not Recommended** |
| **Cloudflare Workers** | 100k req/day serverless | D1 / R2 limited | No FFmpeg binary | No | **Supporting Edge Only** |

> [!NOTE]
> Free-tier terms are subject to provider capacity, identity/card verification, and idle-instance policies. Never generate artificial traffic to evade idle policies; maintain portable Docker Compose backups so you can migrate cleanly between any Linux VM providers.
