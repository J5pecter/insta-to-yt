# SocialRelay v1.0.0 — Lifetime Zero-Cost Financial Analysis

SocialRelay was engineered from inception to replace expensive recurring SaaS subscriptions with robust, self-hosted, open-source technology.

---

## 1. Commercial SaaS vs. SocialRelay Cost Comparison

| SaaS Category | Commercial Providers | Typical Cost (Monthly) | Annual Cost | SocialRelay Replacement | SocialRelay Cost |
|---|---|---|---|---|---|
| **Social Media Scheduler** | Buffer, Hootsuite, Metricool, Later | $6 – $30 / mo | $72 – $360 / yr | Self-Hosted APScheduler + SQLite Queue | **$0.00** |
| **Workflow Automation** | Zapier, Make.com, n8n Cloud | $20 – $50 / mo | $240 – $600 / yr | Built-in Python DAG Automation Engine | **$0.00** |
| **Video Transcoding & Hosting** | Cloudinary, Vimeo, AWS MediaConvert | $15 – $89 / mo | $180 – $1,068 / yr | Local FFmpeg 7.1 + UUID Local Storage | **$0.00** |
| **AI Captions & Tagging** | OpenAI ChatGPT Plus / API, Copy.ai | $10 – $20 / mo | $120 – $240 / yr | Local Ollama (Qwen 2.5 / Llama 3.2) + Heuristics | **$0.00** |
| **Instagram Reel Downloader APIs** | RapidAPI Video Downloaders | $10 – $25 / mo | $120 – $300 / yr | Native URL Ingestion & Direct File Uploads | **$0.00** |
| **Cloud Hosting & Databases** | Heroku, Supabase, AWS RDS | $10 – $25 / mo | $120 – $300 / yr | Local Machine / Docker + SQLite WAL | **$0.00** |
| **Remote Private Access** | Ngrok Paid, VPN SaaS | $8 – $15 / mo | $96 – $180 / yr | Tailscale Free Tier / Cloudflare Zero Trust | **$0.00** |
| **TOTAL ANNUAL SPEND** | | | **$948 – $3,048 / year** | | **$0.00 / year** |

---

## 2. Five-Year Savings Projection

$$\text{5-Year Commercial SaaS Cost} = \$948 \times 5 = \mathbf{\$4,740} \quad \text{to} \quad \$3,048 \times 5 = \mathbf{\$15,240}$$
$$\text{5-Year SocialRelay Cost} = \mathbf{\$0.00}$$

By self-hosting SocialRelay, content creators, media teams, and agencies save between **$4,700 and $15,200 every 5 years** while retaining 100% data sovereignty and ownership over their media libraries and access tokens.

---

## 3. Real-World Hardware & Electricity Realities

While SocialRelay eliminates all software and platform subscriptions, physical computing hardware consumes electricity.

### Scenario A: Running on Your Existing Daily PC / Laptop
- **Usage**: Kept running during normal daytime work/editing hours.
- **Incremental Electricity**: ~$5 – $10 / year.
- **Setup Cost**: $0.00.

### Scenario B: Dedicated Low-Power Mini PC (e.g., Intel N100 / Beelink)
- **Power Consumption**: 10 Watts idle, 25 Watts during FFmpeg transcode bursts (average ~12 Watts).
- **Annual Power Usage**:
  $$12 \text{ Watts} \times 24 \text{ hours/day} \times 365 \text{ days} = 105.12 \text{ kWh/year}$$
- **Annual Electricity Cost** (at standard \$0.15 / kWh):
  $$105.12 \text{ kWh} \times \$0.15 = \mathbf{\$15.77 \text{ / year}}$$
- **Hardware Investment**: A one-time purchase of ~$120 – $150 for an Intel N100 mini PC pays for itself within the first two months compared to a Buffer + Zapier subscription.

### Scenario C: Oracle Cloud Always Free Tier (VPS Alternative)
- If you prefer not to run home hardware 24/7, Oracle Cloud provides an **Always Free Tier**:
  - Up to 4 ARM Ampere CPU cores
  - 24 GB of RAM
  - 200 GB of NVMe block storage
  - Public IP address with zero monthly charges forever.
  - SocialRelay runs seamlessly inside Docker Compose on this free instance.

---

## 4. Storage Growth & Management Strategy

High-definition vertical video files take up disk space:
- Standard 60-second 1080×1920 MP4 at 15 Mbps $\approx 110\text{ MB}$.
- 100 videos imported and processed $\approx 11\text{ GB}$.

SocialRelay provides three built-in cost-control storage mechanisms in [manager.py](file:///d:/Claude%20Apps/Insta%20to%20YT/api/app/services/storage/manager.py):
1. **Deduplication**: SHA-256 hash checks prevent saving duplicate master files.
2. **Automated 24-Hour Temp Cleanup**: Intermediary FFmpeg frames and unreferenced temporary clips are purged daily.
3. **Storage Quota Guard**: Configurable maximum storage threshold (e.g. 50GB) prevents disk overfilling.
