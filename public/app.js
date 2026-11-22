// public/app.js
// Simple client for the Switchly demo dashboard - premium UI version

const API_BASE = '/api';

// Helper to fetch JSON with error handling
async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

/* ---------- Environment ---------- */
async function loadEnvironments() {
  const envSelect = document.getElementById('env-select');
  const envs = await fetchJSON(`${API_BASE}/environments`);
  envSelect.innerHTML = '';
  envs.forEach(e => {
    const opt = document.createElement('option');
    opt.value = e;
    opt.textContent = e;
    envSelect.appendChild(opt);
  });
  const stats = await fetchJSON(`${API_BASE}/stats`);
  envSelect.value = stats.currentEnvironment;
  // display current env in panel (used on Environments page)
  const currentEnvEl = document.getElementById('current-env');
  if (currentEnvEl) currentEnvEl.textContent = stats.currentEnvironment;

  // listen for changes
  envSelect.addEventListener('change', async (e) => {
    await fetchJSON(`${API_BASE}/environment`, {
      method: 'POST',
      body: JSON.stringify({ environment: e.target.value }),
    });
    await refreshAll();
    showToast(`Switched to ${e.target.value}`);
  });
}

/* ---------- Navigation & Sidebar ---------- */
function initNavigation() {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const target = link.getAttribute('href').substring(1);
      // activate link
      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      // show/hide sections using .active class
      document.querySelectorAll('.section').forEach(sec => {
        if (sec.id === target) sec.classList.add('active');
        else sec.classList.remove('active');
      });
    });
  });
}

function setupSidebarToggle() {
  const toggle = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('sidebar');
  if (!toggle || !sidebar) return;
  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('show');
  });
}

/* ---------- Toast ---------- */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

/* ---------- Flags ---------- */
async function loadFlags() {
  const flags = await fetchJSON(`${API_BASE}/flags`);
  const tbody = document.querySelector('#flags-table tbody');
  tbody.innerHTML = '';
  const select = document.getElementById('eval-flag-select');
  select.innerHTML = '';
  flags.forEach(f => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${f.key}</td>
      <td>${f.enabled === undefined ? '—' : f.enabled ? 'Enabled' : 'Disabled'}</td>
      <td>${f.targets ? JSON.stringify(f.targets) : ''}</td>
      <td>${f.rolloutPercentage ?? ''}</td>
      <td>
        <button class="toggle-btn" data-key="${f.key}">${f.enabled ? 'Disable' : 'Enable'}</button>
        <button class="delete-btn" data-key="${f.key}">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);

    const opt = document.createElement('option');
    opt.value = f.key;
    opt.textContent = f.key;
    select.appendChild(opt);
  });
  attachFlagButtons();
}

function attachFlagButtons() {
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.onclick = async () => {
      const key = btn.dataset.key;
      const flag = await fetchJSON(`${API_BASE}/flags/${key}`);
      await fetchJSON(`${API_BASE}/flags/${key}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !flag.enabled }),
      });
      await refreshAll();
    };
  });
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.onclick = async () => {
      const key = btn.dataset.key;
      if (confirm(`Delete flag "${key}"?`)) {
        await fetchJSON(`${API_BASE}/flags/${key}`, { method: 'DELETE' });
        await refreshAll();
      }
    };
  });
}

// Create new flag (prompt based – can be replaced with a modal later)
document.getElementById('create-flag-btn').addEventListener('click', async () => {
  const key = prompt('Flag key (unique identifier):');
  if (!key) return;
  const enabled = confirm('Enable flag by default?');
  const rollout = prompt('Rollout percentage (0‑100) or leave blank:');
  const targets = prompt('Targets JSON (e.g. [{"userId":"alice"}] ) or leave blank:');
  const body = { key, enabled };
  if (rollout) body.rolloutPercentage = Number(rollout);
  if (targets) {
    try { body.targets = JSON.parse(targets); } catch (e) { alert('Invalid JSON for targets – ignoring.'); }
  }
  try {
    await fetchJSON(`${API_BASE}/flags`, { method: 'POST', body: JSON.stringify(body) });
    await refreshAll();
    showToast('Flag created');
  } catch (e) {
    alert('Error: ' + e.message);
  }
});

/* ---------- Evaluation ---------- */
document.getElementById('evaluate-btn').addEventListener('click', async () => {
  const key = document.getElementById('eval-flag-select').value;
  const userId = document.getElementById('eval-user-id').value || 'anonymous';
  const attrsRaw = document.getElementById('eval-attributes').value;
  let attributes = {};
  if (attrsRaw) {
    try { attributes = JSON.parse(attrsRaw); } catch (e) { alert('Invalid attributes JSON'); return; }
  }
  try {
    const result = await fetchJSON(`${API_BASE}/evaluate/${key}`, {
      method: 'POST',
      body: JSON.stringify({ userId, attributes }),
    });
    const out = document.getElementById('eval-result');
    out.textContent = `Enabled: ${result.enabled} (Reason: ${result.reason})`;
    out.className = `result ${result.enabled ? 'success' : 'error'}`;
    await refreshStats();
    await loadHistory();
  } catch (e) {
    alert('Eval error: ' + e.message);
  }
});

/* ---------- Charts ---------- */
let flagsDistChart = null;
let evalActivityChart = null;

function renderFlagDistributionChart(enabled, disabled) {
  const ctx = document.getElementById('flags-distribution-chart').getContext('2d');
  const data = {
    labels: ['Enabled', 'Disabled'],
    datasets: [{ data: [enabled, disabled], backgroundColor: ['#28a745', '#dc3545'] }]
  };
  if (flagsDistChart) flagsDistChart.destroy();
  flagsDistChart = new Chart(ctx, { type: 'doughnut', data, options: { responsive: true, maintainAspectRatio: false } });
}

function renderEvaluationActivityChart(evals) {
  const ctx = document.getElementById('evaluation-activity-chart').getContext('2d');
  const enabled = evals.filter(e => e.enabled).length;
  const disabled = evals.length - enabled;
  const data = {
    labels: ['Enabled', 'Disabled'],
    datasets: [{ data: [enabled, disabled], backgroundColor: ['#28a745', '#dc3545'] }]
  };
  if (evalActivityChart) evalActivityChart.destroy();
  evalActivityChart = new Chart(ctx, { type: 'pie', data, options: { responsive: true, maintainAspectRatio: false } });
}

/* ---------- Stats & Overview ---------- */
async function refreshStats() {
  const stats = await fetchJSON(`${API_BASE}/stats`);
  document.getElementById('total-flags').textContent = stats.totalFlags;
  document.getElementById('enabled-flags').textContent = stats.enabledFlags;
  document.getElementById('disabled-flags').textContent = stats.disabledFlags;
  document.getElementById('total-evals').textContent = stats.totalEvaluations;
  // charts
  renderFlagDistributionChart(stats.enabledFlags, stats.disabledFlags);
  renderEvaluationActivityChart(stats.recentEvaluations || []);
}

async function loadHistory() {
  const stats = await fetchJSON(`${API_BASE}/stats`);
  const tbody = document.getElementById('history-body');
  tbody.innerHTML = '';
  stats.recentEvaluations.forEach(h => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(h.timestamp).toLocaleTimeString()}</td>
      <td>${h.key}</td>
      <td>${h.userId}</td>
      <td>${h.environment}</td>
      <td>${h.enabled}</td>
      <td>${h.reason}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function refreshAll() {
  await Promise.all([loadFlags(), refreshStats(), loadHistory()]);
}

/* ---------- Initial Load ---------- */
(async () => {
  await loadEnvironments();
  await refreshAll();
  initNavigation();
  setupSidebarToggle();
})();
