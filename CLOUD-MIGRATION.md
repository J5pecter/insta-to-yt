# SocialRelay V4 — Provider-Neutral Cloud Migration Guide

If you ever need to move SocialRelay from Oracle Cloud to another Linux VM (e.g., Google Cloud, Hetzner, or a home mini-PC), zero application logic changes are required.

## Step 1: Export Portable Bundle on Old Server
```bash
cd /opt/socialrelay
./scripts/migrate-provider.sh
```
This creates an atomic SQLite snapshot (`VACUUM INTO`), archives `originals/`, `processed/`, and `thumbnails/`, and packages `.env.production` (containing your `ENCRYPTION_MASTER_KEY`).

## Step 2: Provision & Deploy on New Linux VM
```bash
git clone https://github.com/J5pecter/insta-to-yt.git /opt/socialrelay
cd /opt/socialrelay
./scripts/install-production.sh
# Restore exported .env.production, socialrelay.db, and media_storage.tar.gz into /var/lib/socialrelay/
./scripts/deploy-production.sh
```

## Step 3: Update DNS
Point your domain's `A` record (or DuckDNS IP) to the new server's public IPv4 address. Caddy will automatically issue a fresh Let's Encrypt TLS certificate.
