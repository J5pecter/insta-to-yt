# SocialRelay V4 — Independent Domain & DNS Setup

SocialRelay is designed to run on its own independent domain or a free dynamic DNS subdomain—completely separate from any unrelated websites.

## Option A: Free Subdomain (DuckDNS — ₹0)
1. Sign in at [duckdns.org](https://www.duckdns.org/) and claim a free subdomain (e.g., `socialrelay-app.duckdns.org`).
2. Set its IPv4 address to your cloud VM's public IP.
3. In `.env.production`, set:
   ```env
   DOMAIN=socialrelay-app.duckdns.org
   PUBLIC_BASE_URL=https://socialrelay-app.duckdns.org
   ```

## Option B: Custom Domain `A` Record
| Type | Name | Value | TTL |
|---|---|---|---|
| `A` | `socialrelay` (or `api`) | `<CLOUD_VM_PUBLIC_IP>` | `300` |

Verify propagation before starting Caddy:
```bash
dig +short your-domain.example
```
