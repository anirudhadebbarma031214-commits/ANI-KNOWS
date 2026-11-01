const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const Docker = require("dockerode");
const path = require("node:path");
const crypto = require("node:crypto");

const app = express();
const docker = new Docker({ socketPath: process.env.DOCKER_SOCKET || "/var/run/docker.sock" });
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const API_KEY = process.env.ANI_HOST_API_KEY || "";
const MAX_SERVERS = clampInt(process.env.MAX_SERVERS, 1, 20, 3);
const MIN_MEMORY_MB = clampInt(process.env.MIN_MEMORY_MB, 512, 65536, 1024);
const MAX_MEMORY_MB = clampInt(process.env.MAX_MEMORY_MB, MIN_MEMORY_MB, 65536, 4096);
const PORT_START = clampInt(process.env.SERVER_PORT_START, 1024, 65535, 25565);
const PORT_END = clampInt(process.env.SERVER_PORT_END, PORT_START, 65535, 25575);
const IMAGE = "itzg/minecraft-server:java21";
const SOFTWARE = new Set(["VANILLA", "PAPER", "PURPUR", "FABRIC", "FORGE"]);
const VERSION_RE = /^(LATEST|[0-9]+\.[0-9]+(?:\.[0-9]+)?)$/i;
const NAME_RE = /^[a-zA-Z0-9 _.-]{3,32}$/;

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}
function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function requireApiKey(req, res, next) {
  if (API_KEY.length < 32) return res.status(503).json({ error: "Server misconfigured: set ANI_HOST_API_KEY to a secret of at least 32 characters." });
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !safeEqual(token, API_KEY)) return res.status(401).json({ error: "Unauthorized. Sign in with your ANI HOST admin API key." });
  next();
}
function jsonError(res, error, fallback) {
  const message = error && error.message ? error.message : (fallback || "Request failed");
  console.error("[ANI HOST]", message);
  return res.status(500).json({ error: message.slice(0, 300) });
}
function isValidId(id) {
  return typeof id === "string" && /^[a-f0-9-]{36}$/i.test(id);
}
function isAniContainer(container) {
  return container.Labels && container.Labels["ani-host"] === "true";
}
function mapContainer(c) {
  const labels = c.Labels || {};
  const ports = c.Ports || [];
  const port = ports.find(function (p) { return p.PrivatePort === 25565 && p.Type === "tcp"; });
  return {
    id: labels["ani-host.id"] || (c.Names && c.Names[0] ? c.Names[0].replace(/^\//, "") : c.Id.slice(0, 12)),
    name: labels["ani-host.name"] || "Minecraft server",
    software: labels["ani-host.software"] || "PAPER",
    version: labels["ani-host.version"] || "LATEST",
    memoryMb: Number(labels["ani-host.memory"] || 2048),
    state: c.State,
    status: c.Status,
    address: port && port.PublicPort ? (process.env.PUBLIC_SERVER_HOST || "YOUR_SERVER_IP") + ":" + port.PublicPort : null,
    port: port ? port.PublicPort : null
  };
}
async function listAniContainers() {
  const containers = await docker.listContainers({ all: true });
  return containers.filter(isAniContainer).map(mapContainer);
}
async function ensureImage() {
  try {
    await docker.getImage(IMAGE).inspect();
  } catch (err) {
    if (err.statusCode !== 404) throw err;
    console.log("Pulling " + IMAGE + "; first startup may take several minutes...");
    const stream = await docker.pull(IMAGE);
    await new Promise(function (resolve, reject) {
      docker.modem.followProgress(stream, function (error) { if (error) reject(error); else resolve(); });
    });
  }
}
async function findFreePort() {
  const containers = await docker.listContainers({ all: true });
  const used = new Set();
  containers.forEach(function (c) {
    (c.Ports || []).forEach(function (p) { if (p.PublicPort) used.add(p.PublicPort); });
  });
  for (let port = PORT_START; port <= PORT_END; port++) if (!used.has(port)) return port;
  throw new Error("No free Minecraft ports. Expand SERVER_PORT_START and SERVER_PORT_END.");
}
async function findContainer(id) {
  if (!isValidId(id)) return null;
  const all = await docker.listContainers({ all: true });
  const found = all.find(function (c) { return isAniContainer(c) && c.Labels["ani-host.id"] === id; });
  return found ? docker.getContainer(found.Id) : null;
}

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "16kb" }));
app.use("/api/", rateLimit({ windowMs: 60000, limit: 120, standardHeaders: "draft-7", legacyHeaders: false }));

app.get("/api/health", async function (_req, res) {
  try {
    await docker.ping();
    res.json({ ok: true, service: "ANI HOST", docker: "connected", configured: API_KEY.length >= 32 });
  } catch (err) {
    res.status(503).json({ ok: false, service: "ANI HOST", docker: "unavailable", error: err.message });
  }
});
app.use("/api", requireApiKey);

app.get("/api/servers", async function (_req, res) {
  try { res.json({ servers: await listAniContainers() }); }
  catch (err) { jsonError(res, err, "Could not list servers"); }
});

app.post("/api/servers", async function (req, res) {
  let volumeName = null;
  try {
    const current = await listAniContainers();
    if (current.length >= MAX_SERVERS) return res.status(429).json({ error: "Server limit reached (" + MAX_SERVERS + "). Adjust MAX_SERVERS in .env." });
    const name = String(req.body.name || "My Minecraft World").trim();
    const software = String(req.body.software || "PAPER").toUpperCase();
    const version = String(req.body.version || "LATEST").toUpperCase();
    const memoryMb = Number(req.body.memoryMb || 2048);
    if (!NAME_RE.test(name)) return res.status(400).json({ error: "Name must be 3–32 characters using letters, numbers, spaces, dots, underscores or hyphens." });
    if (!SOFTWARE.has(software)) return res.status(400).json({ error: "Choose Vanilla, Paper, Purpur, Fabric or Forge." });
    if (!VERSION_RE.test(version)) return res.status(400).json({ error: "Use LATEST or a Minecraft version such as 1.21.4." });
    if (!Number.isInteger(memoryMb) || memoryMb < MIN_MEMORY_MB || memoryMb > MAX_MEMORY_MB) return res.status(400).json({ error: "Memory must be between " + MIN_MEMORY_MB + " and " + MAX_MEMORY_MB + " MB." });
    await ensureImage();
    const id = crypto.randomUUID();
    const port = await findFreePort();
    volumeName = "ani-host-world-" + id;
    await docker.createVolume({ Name: volumeName, Labels: { "ani-host": "true", "ani-host.id": id } });
    const labels = {
      "ani-host": "true",
      "ani-host.id": id,
      "ani-host.name": name,
      "ani-host.software": software,
      "ani-host.version": version,
      "ani-host.memory": String(memoryMb)
    };
    const container = await docker.createContainer({
      Image: IMAGE,
      name: "ani-host-" + id,
      Env: [
        "EULA=TRUE",
        "TYPE=" + software,
        "VERSION=" + version,
        "MEMORY=" + memoryMb + "M",
        "MAX_PLAYERS=20",
        "ENABLE_RCON=true",
        "ONLINE_MODE=true",
        "MOTD=Welcome to an ANI HOST Minecraft server!"
      ],
      Labels: labels,
      ExposedPorts: { "25565/tcp": {} },
      HostConfig: {
        PortBindings: { "25565/tcp": [{ HostPort: String(port), HostIp: "0.0.0.0" }] },
        Binds: [volumeName + ":/data"],
        Memory: memoryMb * 1024 * 1024,
        MemorySwap: memoryMb * 1024 * 1024,
        RestartPolicy: { Name: "unless-stopped" },
        Init: true
      }
    });
    res.status(201).json({
      server: mapContainer({
        Id: container.id, Names: ["/ani-host-" + id], State: "created", Status: "Created",
        Labels: labels, Ports: [{ PrivatePort: 25565, PublicPort: port, Type: "tcp" }]
      }),
      message: "Real Minecraft container created. Press Start to launch it."
    });
  } catch (err) {
    if (volumeName) await docker.getVolume(volumeName).remove({ force: true }).catch(function () {});
    jsonError(res, err, "Could not create server");
  }
});

app.post("/api/servers/:id/:action", async function (req, res, next) {
  const id = req.params.id;
  const action = req.params.action;
  if (["start", "stop", "restart"].indexOf(action) === -1) return next();
  try {
    const container = await findContainer(id);
    if (!container) return res.status(404).json({ error: "Server not found." });
    const info = await container.inspect();
    if (action === "start" && !info.State.Running) await container.start();
    if (action === "stop" && info.State.Running) await container.stop({ t: 15 });
    if (action === "restart") {
      if (info.State.Running) await container.restart({ t: 15 });
      else await container.start();
    }
    const latest = await container.inspect();
    res.json({ ok: true, action: action, state: latest.State.Status, message: "Server " + action + " request completed." });
  } catch (err) { jsonError(res, err, "Could not " + action + " server"); }
});

app.get("/api/servers/:id/logs", async function (req, res) {
  try {
    const container = await findContainer(req.params.id);
    if (!container) return res.status(404).json({ error: "Server not found." });
    const logs = await container.logs({ stdout: true, stderr: true, tail: 150, timestamps: true });
    res.type("text/plain").send(Buffer.isBuffer(logs) ? logs.toString("utf8").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "") : String(logs));
  } catch (err) { jsonError(res, err, "Could not read logs"); }
});

app.post("/api/servers/:id/command", async function (req, res) {
  try {
    const command = String(req.body.command || "").trim();
    if (!command || command.length > 300 || /[\r\n\0]/.test(command)) return res.status(400).json({ error: "Enter a single command (maximum 300 characters)." });
    const container = await findContainer(req.params.id);
    if (!container) return res.status(404).json({ error: "Server not found." });
    const info = await container.inspect();
    if (!info.State.Running) return res.status(409).json({ error: "Start the server before sending commands." });
    const exec = await container.exec({ Cmd: ["rcon-cli"].concat(command.replace(/^\//, "").split(/\s+/)), AttachStdout: true, AttachStderr: true, Tty: false });
    const stream = await exec.start({ hijack: false, stdin: false });
    const output = await new Promise(function (resolve, reject) {
      let data = "";
      let settled = false;
      const finish = function () { if (!settled) { settled = true; resolve(data.slice(0, 8000)); } };
      stream.on("data", function (chunk) { data += chunk.toString("utf8"); });
      stream.on("end", finish);
      stream.on("error", reject);
      setTimeout(finish, 4500).unref();
    });
    res.json({ ok: true, output: output });
  } catch (err) { jsonError(res, err, "Could not send command"); }
});

app.delete("/api/servers/:id", async function (req, res) {
  try {
    const container = await findContainer(req.params.id);
    if (!container) return res.status(404).json({ error: "Server not found." });
    const info = await container.inspect();
    const volume = (info.Mounts || []).find(function (m) { return m.Destination === "/data" && m.Name; });
    if (info.State.Running) await container.stop({ t: 15 });
    await container.remove();
    if (req.query.deleteWorld === "true" && volume) await docker.getVolume(volume.Name).remove({ force: true });
    res.json({ ok: true, worldDeleted: req.query.deleteWorld === "true", message: req.query.deleteWorld === "true" ? "Server and world deleted." : "Server container removed; world data kept in a Docker volume." });
  } catch (err) { jsonError(res, err, "Could not delete server"); }
});

app.get("/", function (_req, res) { res.sendFile(path.resolve(__dirname, "..", "index.html")); });
app.get("/style.css", function (_req, res) { res.sendFile(path.resolve(__dirname, "..", "style.css")); });
app.get("/script.js", function (_req, res) { res.sendFile(path.resolve(__dirname, "..", "script.js")); });
app.listen(PORT, HOST, function () {
  console.log("ANI HOST listening on http://" + HOST + ":" + PORT);
  if (API_KEY.length < 32) console.warn("WARNING: set ANI_HOST_API_KEY to a random secret of at least 32 characters.");
});
