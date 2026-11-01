# ANI HOST real server backend

This backend uses Docker to create actual Java Edition Minecraft containers from the itzg/minecraft-server image. World files live in named Docker volumes.

## Requirements
- An always-on Linux VPS or Linux computer
- Docker Engine and Docker Compose plugin
- Inbound TCP access for the panel (default 3000) and Minecraft ports (default 25565–25575)
- Enough RAM for the OS, panel, and each Minecraft server

## Quick start on Linux
1. Clone this repository on the Linux host.
2. Copy .env.example to .env.
3. Generate a secret with: openssl rand -hex 32
4. Put that secret in ANI_HOST_API_KEY in .env. Never commit .env to GitHub.
5. Set PUBLIC_SERVER_HOST in .env to the public IP or DNS name players should use.
6. Run: docker compose up -d --build
7. Visit http://YOUR_SERVER_IP:3000 from a trusted network.
8. Click Sign in and enter the API key.
9. Create a server and press Start. First boot downloads Minecraft server files and can take several minutes.
10. Allow TCP ports 25565–25575 in the VPS firewall and cloud firewall.

## API endpoints
All endpoints except GET /api/health require Authorization: Bearer <ANI_HOST_API_KEY>.

- GET /api/health — Docker connection health
- GET /api/servers — list ANI HOST containers
- POST /api/servers — create a server with JSON such as {"name":"Survival","software":"PAPER","version":"1.21.4","memoryMb":2048}
- POST /api/servers/:id/start
- POST /api/servers/:id/stop
- POST /api/servers/:id/restart
- GET /api/servers/:id/logs
- POST /api/servers/:id/command — JSON {"command":"list"}
- DELETE /api/servers/:id — removes container but keeps world data
- DELETE /api/servers/:id?deleteWorld=true — permanently deletes the container and world volume

Software values: VANILLA, PAPER, PURPUR, FABRIC, FORGE. Use a version supported by the selected software.

## Security warning
Access to Docker's socket is effectively host-root access. Keep this panel private, use a strong random API key, and do not expose port 3000 directly to the public internet for a multi-user hosting business. The current API key is a single-admin gate, not a per-user account system. Before accepting customers, add real user authentication, per-user server ownership and quotas, audit logs, and hardened container/network isolation.

The frontend asks for the API key and stores it in that browser's local storage for convenience. Use this only on a trusted, private admin panel. Remove saved credentials from browser storage on shared devices.

## Current limits
- Java Edition only; Bedrock/Geyser management is not implemented.
- No automated backups or file manager yet.
- No domain automation or NAT traversal.
- Static hosting alone cannot run Minecraft containers. An always-on VPS or host computer is required.
