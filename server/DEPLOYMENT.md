# Beginner deployment checklist

## What you need
A Linux VPS with Docker installed is the easiest first host. A Windows PC can be used for testing, but players outside your home cannot join unless router port forwarding is configured and your ISP permits inbound connections. A VPS is easier for public access.

## Steps
1. Install Docker Engine and the Docker Compose plugin on the Linux VPS.
2. Clone the ANI-KNOWS repository.
3. In the project folder, copy .env.example to .env.
4. Generate a secret using openssl rand -hex 32. Paste the result after ANI_HOST_API_KEY= in .env.
5. Set PUBLIC_SERVER_HOST to your VPS public IP or DNS name.
6. Open TCP 3000 for the panel and TCP 25565–25575 for Minecraft in the VPS firewall. Restrict port 3000 to your own IP if possible.
7. Run docker compose up -d --build.
8. Visit http://YOUR_VPS_IP:3000. Click Sign in and paste the API key.
9. Click New server, choose software/version/memory, then Start.
10. Share the displayed address and port with friends.

## Troubleshooting
- Panel logs: docker compose logs -f ani-host
- List containers: docker ps -a
- Stop the panel: docker compose down
- Check the health endpoint: http://YOUR_VPS_IP:3000/api/health

Never commit .env or share the API key. Never expose the Docker socket over TCP. This starter backend is for a private administrator, not a public multi-user hosting business.
