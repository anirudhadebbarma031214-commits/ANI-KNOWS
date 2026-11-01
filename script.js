const $ = (id) => document.getElementById(id);
let running = false;
let startedAt = 0;
let elapsedBefore = 0;
let timer = null;
let toastTimer = null;
function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}
function clock() {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map(v => String(v).padStart(2, "0")).join(":");
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
function setStatus(isOnline) {
  running = isOnline;
  const status = $("serverStatus");
  status.className = "status " + (isOnline ? "status-online" : "status-offline");
  status.innerHTML = "<i></i> " + (isOnline ? "Online (demo)" : "Offline");
  $("startBtn").disabled = isOnline;
  $("startBtn").style.opacity = isOnline ? ".5" : "1";
  $("players").innerHTML = isOnline ? "0 <small>/ 20</small>" : "0 <small>/ 20</small>";
  $("memory").innerHTML = isOnline ? "512 <small>MB / 2 GB</small>" : "0 <small>MB / 2 GB</small>";
  if (isOnline) {
    startedAt = Date.now();
    timer = setInterval(() => {
      const seconds = Math.floor(elapsedBefore + (Date.now() - startedAt) / 1000);
      $("uptime").textContent = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(v => String(v).padStart(2, "0")).join(":");
    }, 1000);
  } else {
    clearInterval(timer);
    timer = null;
    elapsedBefore = 0;
    $("uptime").textContent = "00:00:00";
  }
}
$("startBtn").addEventListener("click", () => {
  if (running) return;
  setStatus(true);
  log("[Server thread/INFO]: Starting demo server...", "system");
  setTimeout(() => { if (running) log("[Server thread/INFO]: Done! For demo purposes only."); }, 700);
  showToast("Demo server started — no real Minecraft process was launched.");
});
$("stopBtn").addEventListener("click", () => {
  if (!running) { showToast("The demo server is already offline."); return; }
  setStatus(false);
  log("[Server thread/INFO]: Demo server stopped.", "system");
  showToast("Demo server stopped.");
});
$("restartBtn").addEventListener("click", () => {
  if (!running) { showToast("Start the demo server before restarting."); return; }
  setStatus(false);
  log("[ANI]: Restarting demo server...", "system");
  setTimeout(() => { setStatus(true); log("[Server thread/INFO]: Demo server restarted.", "system"); }, 850);
  showToast("Restarting demo server...");
});
document.querySelectorAll(".software-card").forEach(card => card.addEventListener("click", () => {
  document.querySelectorAll(".software-card").forEach(c => c.classList.remove("selected"));
  card.classList.add("selected");
  $("selectedSoftware").textContent = card.dataset.software;
  document.querySelector(".server-title p").textContent = "Java Edition · " + card.dataset.software + " 1.21.4";
  log("[ANI]: Selected software " + card.dataset.software + " (UI preview).");
}));
$("copyAddress").addEventListener("click", async () => {
  const address = "ani-host.example.net";
  try { await navigator.clipboard.writeText(address); showToast("Demo address copied."); }
  catch { showToast("Demo address: " + address); }
});
$("createBtn").addEventListener("click", () => showToast("Server creation wizard is planned for the backend phase."));
$("loginBtn").addEventListener("click", () => showToast("Account sign-in will be added with authentication setup."));
$("clearConsole").addEventListener("click", () => { $("consoleOutput").replaceChildren(); log("Console output cleared.", "system"); });
$("commandForm").addEventListener("submit", event => {
  event.preventDefault();
  const input = $("commandInput");
  const command = input.value.trim();
  if (!command) return;
  log("> " + command, "system");
  const normalized = command.toLowerCase();
  if (normalized === "help") log("Demo commands: help, list, tps, say <message>, status");
  else if (normalized === "list") log("There are 0 of a maximum of 20 players online.");
  else if (normalized === "tps") log(running ? "TPS (demo): 20.0" : "Server is offline.");
  else if (normalized === "status") log(running ? "Demo server status: online" : "Demo server status: offline");
  else if (normalized.startsWith("say ")) log("[Server]: " + command.slice(4));
  else log("Unknown demo command. Type help for available commands.", "error");
  input.value = "";
});
$("year").textContent = new Date().getFullYear();