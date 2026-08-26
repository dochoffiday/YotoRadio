import { isLoggedIn, getValidAccessToken } from "./auth.js";

const API_BASE = "https://api.yotoplay.com";

const PROBES = [
  { name: "GET /content/mine", method: "GET", path: "/content/mine", scope: "user:content:view" },
  { name: "GET /device-v2/devices/mine", method: "GET", path: "/device-v2/devices/mine", scope: "family:devices:view" },
  { name: "GET /media/displayIcons/user/me", method: "GET", path: "/media/displayIcons/user/me", scope: "user:icons:manage" },
  { name: "GET /media/displayIcons/user/yoto", method: "GET", path: "/media/displayIcons/user/yoto", scope: "user:icons:manage (public icons)" },
  {
    name: "POST /content",
    method: "POST",
    path: "/content",
    scope: "user:content:manage",
    body: {
      title: "Debug probe card (harmless if it succeeds — safe to delete)",
      content: {
        chapters: [
          {
            key: "01",
            title: "Debug probe",
            overlayLabel: "1",
            display: {},
            tracks: [
              {
                key: "01",
                type: "stream",
                format: "mp3",
                title: "Debug probe",
                trackUrl: "https://yoto.dev/audio/autumn-3.mp3",
                display: {},
              },
            ],
          },
        ],
      },
    },
  },
];

const accountStatusEl = document.getElementById("account-status");
const logEl = document.getElementById("log");
const runButton = document.getElementById("run-button");

accountStatusEl.textContent = isLoggedIn() ? "Logged in to Yoto." : "Not logged in — go log in on the main app first.";
runButton.disabled = !isLoggedIn();

runButton.addEventListener("click", runAll);

async function runAll() {
  logEl.innerHTML = "";
  runButton.disabled = true;

  let accessToken;
  try {
    accessToken = await getValidAccessToken();
  } catch (err) {
    logRow({ name: "getValidAccessToken()", ok: false, detail: err.message });
    runButton.disabled = false;
    return;
  }

  for (const probe of PROBES) {
    await runProbe(probe, accessToken);
  }
  runButton.disabled = false;
}

async function runProbe(probe, accessToken) {
  const row = logRow({ name: `${probe.name}  (scope: ${probe.scope})`, ok: null, detail: "running..." });

  try {
    const res = await fetch(`${API_BASE}${probe.path}`, {
      method: probe.method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(probe.body ? { "Content-Type": "application/json" } : {}),
      },
      body: probe.body ? JSON.stringify(probe.body) : undefined,
    });
    const text = await res.text();
    updateRow(row, { ok: res.ok, detail: `HTTP ${res.status}\n${text.slice(0, 500)}` });
  } catch (err) {
    updateRow(row, { ok: false, detail: `Blocked before a response was readable (likely CORS): ${err.message}` });
  }
}

function logRow({ name, ok, detail }) {
  const el = document.createElement("div");
  el.className = "probe";
  logEl.appendChild(el);
  updateRow(el, { name, ok, detail });
  return el;
}

function updateRow(el, { name, ok, detail }) {
  if (name !== undefined) el.dataset.name = name;
  const statusClass = ok === null ? "" : ok ? "probe-status--ok" : "probe-status--fail";
  const statusText = ok === null ? "…" : ok ? "OK" : "FAIL";
  el.innerHTML = `
    <div class="probe-head"><span>${el.dataset.name}</span><span class="${statusClass}">${statusText}</span></div>
    <pre>${escapeHtml(detail)}</pre>
  `;
}

function escapeHtml(str) {
  return str.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}
