# ANI HOST — Minecraft Server Hosting

ANI HOST is a self-hosted Minecraft server management panel with a dark, responsive dashboard and a Docker-backed Java server API.

## What is implemented
- Dashboard connected to a real backend API
- Create real Java Edition server containers using Vanilla, Paper, Purpur, Fabric, or Forge
- Start, stop, and restart containers
- Persist world files in named Docker volumes
- Read server logs and send console commands
- Configure memory caps, server count, and public Minecraft ports
- Admin API key authentication for a private single-admin panel

## Run a real host
This project requires an always-on Linux computer or VPS with Docker Engine and Docker Compose. Static hosting services such as GitHub Pages or Vercel cannot run persistent Minecraft servers.

1. On the Linux host, clone this repository.
2. Copy .env.example to .env.
3. Generate a key with `openssl rand -hex 32` and set it as ANI_HOST_API_KEY in .env.
4. Set PUBLIC_SERVER_HOST to the public IP address or DNS name players should connect to.
5. Run `docker compose up -d --build`.
6. Open `http://YOUR_SERVER_IP:3000` from a trusted network.
7. Click Sign in, paste the API key, create a server, then press Start.
8. Open TCP ports 25565–25575 in the server firewall and cloud firewall.

Detailed instructions: [server/DEPLOYMENT.md](server/DEPLOYMENT.md)

## Important security note
The backend mounts the Docker socket, which grants powerful control over the host. Keep the panel private and use a strong secret. This MVP uses a single admin API key and is not ready to accept public customers. Before multi-user launch, implement proper accounts, per-user server ownership and quotas, audited actions, backups, and stronger isolation.

## Current limitations
- Java Edition only; Bedrock/Geyser is not implemented.
- Backups and file manager are not implemented yet.
- No public customer accounts or billing.
- A real deployment has not been provisioned from this repository; you must run it on a host with Docker.
