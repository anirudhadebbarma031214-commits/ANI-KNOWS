const $ = (id) => document.getElementById(id);
const KEY_NAME = "ani-host-admin-key";
let activeServerId = null;
let activeServer = null;
let apiKey = localStorage.getItem(KEY_NAME) || "";
let toastTimer = null;
let pollTimer = null;

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}
function clock() {
  return new Date().toLocaleTimeString([], { hour12: false });
}
function log(message, type = "normal") {
  const line = document.createElement("p");
  const time = document.createElement("span");
  time.className = "log-time";
  time.textContent = clock() + " ";
  const content = document.createElement("span");
  content.className = type === "system" ? "log-system" : type === "error" ? "log-error" : "";
  content.textContent = message;
  line.append(time, content);
  $("consoleOutput").appendChild(line);
  $("consoleOutput").scrollTop = $("consoleOutput").scrollHeight;
}
async function api(path, options = {}) {
  const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
  if (apiKey) headers.Authorization = "Bearer " + apiKey;
  const response = await fetch(path, Object.assign({}, options, { headers }));
  const type = response.headers.get("content-type") || "";
  const data = type.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const message = data && data.error ? data.error : ("Request failed (" + response.status + ")");
    if (response.status === 401) {
      apiKey = "";
      localStorage.removeItem(KEY_NAME);
      updateConnection(false, "Sign in required");
    }
    throw new Error(message);
  }
  return data;
}
function updateConnection(connected, label) {
  const btn = $("loginBtn");
  btn.textContent = connected ? "Admin connected ✓" : (label || "Sign in ↗");
  btn.title = connected ? "Click to sign out" : "Connect to your ANI HOST backend";
}
function setStatus(state, statusText) {
  const online = state === "running";
  const starting = state === "created" || state === "restarting";
  const status = $("serverStatus");
  status.className = "status " + (online ? "status-online" : "status-offline");
  status.innerHTML = "<i></i> " + (statusText || (online ? "Online" : starting ? "Starting" : "Offline"));
  $("startBtn").disabled = online || starting;
  $("startBtn").style.opacity = online || starting ? ".5" : "1";
  $("stopBtn").disabled = !online;
  $("restartBtn").disabled = !online;
  $("players").innerHTML = online ? "Live <small>/ 20 max</small>" : "0 <small>/ 20 max</small>";
  $("memory").innerHTML = activeServer ? activeServer.memoryMb + " <small>MB allocated</small>" : "— <small>not connected</small>";
}
function selectServer(server) {
  activeServer = server;
  activeServerId = server ? server.id : null;
  if (!server) {
    $("serverStatus").className = "status status-offline";
    $("serverStatus").innerHTML = "<i></i> Not connected";
    $("players").innerHTML = "— <small>/ 20 max</small>";
    $("memory").innerHTML = "— <small>not connected</small>";
    $("uptime").textContent = "--:--:--";
    $("copyAddress").innerHTML = "No server selected <b>▢</b>";
    $("demoNote").textContent = "CONNECT TO THE BACKEND TO MANAGE REAL MINECRAFT SERVERS.";
    return;
  }
  $("demoNote").textContent = "REAL SERVER · " + server.id.slice(0, 8).toUpperCase();
  $("server-title-name").textContent = server.name;
  $("server-title-software").textContent = "Java Edition · " + server.software + " " + server.version;
  $("copyAddress").innerHTML = (server.address || "Port " + (server.port || "pending")) + " <b>▢</b>";
  setStatus(server.state, server.status);
  $("uptime").textContent = server.state === "running" ? "RUNNING" : "OFFLINE";
}
async function refreshServers(quiet = false) {
  if (!apiKey) return;
  try {
    const data = await api("/api/servers");
    updateConnection(true);
    const servers = data.servers || [];
    if (!servers.length) {
      selectServer(null);
      log("Connected. No servers created yet.", "system");
      return;
    }
    let server = servers.find(s => s.id === activeServerId) || servers[0];
    selectServer(server);
    if (!quiet) log("Loaded " + servers.length + " real server(s) from Docker.", "system");
  } catch (err) {
    if (!quiet) { log(err.message, "error"); showToast(err.message); }
  }
}
async function connect() {
  if (apiKey) {
    apiKey = "";
    localStorage.removeItem(KEY_NAME);
    clearInterval(pollTimer);
    updateConnection(false, "Sign in ↗");
    log("Signed out of the admin panel.");
    selectServer(null);
    showToast("Signed out. Your Minecraft containers keep running.");
    return;
  }
  const key = prompt("Enter the ANI HOST admin API key from your private server's .env file:");
  if (!key) return;
  apiKey = key.trim();
  try {
    await api("/api/servers");
    localStorage.setItem(KEY_NAME, apiKey);
    updateConnection(true);
    await refreshServers();
    clearInterval(pollTimer);
    pollTimer = setInterval(() => refreshServers(true), 12000);
    log("Secure API connection established.", "system");
    showToast("Connected to your real server backend.");
  } catch (err) {
    apiKey = "";
    localStorage.removeItem(KEY_NAME);
    updateConnection(false, "Sign in ↗");
    showToast("Connection failed: " + err.message);
    log("Backend connection failed: " + err.message, "error");
  }
}
async function serverAction(action) {
  if (!apiKey) { showToast("Click Sign in and connect your backend first."); return; }
  if (!activeServerId) { showToast("Create or select a server first."); return; }
  try {
    log("Sending real " + action + " request to Docker...", "system");
    const result = await api("/api/servers/" + activeServerId + "/" + action, { method: "POST", body: "{}" });
    log(result.message || ("Server " + action + " requested."), "system");
    showToast(result.message || "Request sent.");
    await refreshServers(true);
    if (action === "start" || action === "restart") setTimeout(() => loadLogs(true), 3500);
  } catch (err) { log(err.message, "error"); showToast(err.message); }
}
async function createServer() {
  if (!apiKey) { showToast("Sign in to your private backend first."); return; }
  const name = prompt("Name your Minecraft server:", "My Survival World");
  if (!name) return;
  const selected = $("selectedSoftware").textContent.toUpperCase();
  const version = prompt("Minecraft version (example: 1.21.4 or LATEST):", "1.21.4");
  if (!version) return;
  const memoryText = prompt("RAM for this server in MB (your backend sets the allowed range):", "2048");
  if (!memoryText) return;
  try {
    showToast("Creating real Docker container… first setup may download a large image.");
    const data = await api("/api/servers", { method: "POST", body: JSON.stringify({ name, software: selected, version, memoryMb: Number(memoryText) }) });
    activeServerId = data.server.id;
    log(data.message, "system");
    await refreshServers();
    showToast("Server container created. Press Start to launch Minecraft.");
  } catch (err) { log(err.message, "error"); showToast(err.message); }
}
async function loadLogs(quiet = false) {
  if (!apiKey || !activeServerId) return;
  try {
    const output = await api("/api/servers/" + activeServerId + "/logs");
    const lines = String(output).split(/\r?\n/).filter(Boolean).slice(-80);
    $("consoleOutput").replaceChildren();
    if (!lines.length) log("No server logs yet. Start the server to see startup output.");
    lines.forEach(line => log(line));
  } catch (err) { if (!quiet) showToast(err.message); }
}
async function sendCommand(event) {
  event.preventDefault();
  const input = $("commandInput");
  const command = input.value.trim();
  if (!command) return;
  input.value = "";
  if (!apiKey || !activeServerId) { log("Sign in and select a real server before using the console.", "error"); return; }
  log("> " + command, "system");
  try {
    const result = await api("/api/servers/" + activeServerId + "/command", { method: "POST", body: JSON.stringify({ command }) });
    if (result.output) log(result.output);
    else log("Command sent to the server.", "system");
    setTimeout(() => loadLogs(true), 500);
  } catch (err) { log(err.message, "error"); }
}
$("startBtn").addEventListener("click", () => serverAction("start"));
$("stopBtn").addEventListener("click", () => serverAction("stop"));
$("restartBtn").addEventListener("click", () => serverAction("restart"));
$("createBtn").addEventListener("click", createServer);
$("loginBtn").addEventListener("click", connect);
$("copyAddress").addEventListener("click", async () => {
  if (!activeServer || !activeServer.address || activeServer.address.includes("YOUR_SERVER_IP")) {
    showToast("Set PUBLIC_SERVER_HOST to your public IP or DNS name in .env first.");
    return;
  }
  try { await navigator.clipboard.writeText(activeServer.address); showToast("Minecraft address copied."); }
  catch { showToast("Address: " + activeServer.address); }
});
$("clearConsole").addEventListener("click", () => { $("consoleOutput").replaceChildren(); log("Console display cleared.", "system"); });
$("commandForm").addEventListener("submit", sendCommand);
document.querySelectorAll(".software-card").forEach(card => card.addEventListener("click", () => {
  document.querySelectorAll(".software-card").forEach(c => c.classList.remove("selected"));
  card.classList.add("selected");
  $("selectedSoftware").textContent = card.dataset.software;
  log("Selected software: " + card.dataset.software + ". New servers use this selection.");
}));
$("year").textContent = new Date().getFullYear();
updateConnection(Boolean(apiKey), apiKey ? "Admin connected ✓" : "Sign in ↗");
if (apiKey) {
  refreshServers().then(() => {
    clearInterval(pollTimer);
    pollTimer = setInterval(() => refreshServers(true), 12000);
  });
}
fetch("/api/health").then(r => r.json()).then(data => {
  if (data.docker === "connected") log("Backend health check: Docker connected.", "system");
  else log("Backend health check: " + (data.error || "Docker unavailable"), "error");
}).catch(() => log("Backend API not detected. Run the panel with Docker Compose to enable real servers.", "error"));
