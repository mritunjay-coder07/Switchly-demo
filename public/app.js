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
  try {
    // Show a loading placeholder
    envSelect.innerHTML = '<option>Loading…</option>';
    const envs = await fetchJSON(`${API_BASE}/environments`);
    // Populate options
    envSelect.innerHTML = '';
    envs.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e;
      opt.textContent = e.charAt(0).toUpperCase() + e.slice(1);
      envSelect.appendChild(opt);
    });
    // Get current environment from stats (fallback to "development")
    const stats = await fetchJSON(`${API_BASE}/stats`);
    const currentEnv = stats.currentEnvironment || 'development';
    envSelect.value = currentEnv;
    // reflected in any UI element
    const currentEnvEl = document.getElementById('current-env');
    if (currentEnvEl) currentEnvEl.textContent = currentEnv;
    // Listen for changes
    envSelect.addEventListener('change', async (e) => {
      const newEnv = e.target.value;
      try {
        await fetchJSON(`${API_BASE}/environment`, {
          method: 'POST',
          body: JSON.stringify({ environment: newEnv })
        });
        // Refresh all data after successful switch
        await refreshAll();
        showToast(`Switched to ${newEnv}`);
      } catch (err) {
        console.error('Environment switch error:', err);
        showToast(`Failed to switch environment: ${err.message}`, 'error');
      }
    });
  } catch (err) {
    console.error('Failed to load environments:', err);
    envSelect.innerHTML = '<option value="" disabled>Error loading environments</option>';
    showToast('Could not load environments list', 'error');
  }
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
        body: JSON.stringify({ enabled: !flag.enabled })
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
  const targets = prompt('Targets JSON (e.g. [{\"userId\":\"alice\"}] ) or leave blank:');
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
      body: JSON.stringify({ userId, attributes })
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

// Custom plugin to display total count in the center of the doughnut chart
const centerTextPlugin = {
  id: 'centerText',
  afterDraw(chart) {
    if (chart.config.type !== 'doughnut') return;
    const { ctx, chartArea: { left, width, top, height } } = chart;
    ctx.save();
    const total = chart.config.data.datasets[0].data.reduce((a, b) => a + b, 0);
    ctx.font = 'bold 1.2rem Inter';
    ctx.fillStyle = '#333';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(total, left + width / 2, top + height / 2);
    ctx.restore();
  }
};

function renderFlagDistributionChart(enabled, disabled) {
  const canvas = document.getElementById('flags-distribution-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const data = {
    labels: ['Enabled', 'Disabled'],
    datasets: [{ data: [enabled, disabled], backgroundColor: ['#28a745', '#dc3545'] }]
  };
  if (flagsDistChart) flagsDistChart.destroy();
  flagsDistChart = new Chart(ctx, {
    type: 'doughnut',
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        title: { display: true, text: 'Flag Distribution', font: { size: 16 } },
        tooltip: { enabled: true },
        centerText: {}
      }
    },
    plugins: [centerTextPlugin]
  });
}

function renderEvaluationActivityChart(evals) {
  const container = document.getElementById('evaluation-activity-chart').parentElement;
  const existingEmpty = container.querySelector('.empty-state');
  if (existingEmpty) existingEmpty.remove();
  const canvas = document.getElementById('evaluation-activity-chart');
  if (!canvas) return;
  if (!evals || evals.length === 0) {
    const msg = document.createElement('div');
    msg.className = 'empty-state';
    msg.textContent = 'No evaluations yet. Use the Evaluation Playground to evaluate your first feature flag.';
    container.appendChild(msg);
    canvas.style.display = 'none';
    return;
  }
  canvas.style.display = 'block';
  const enabled = evals.filter(e => e.enabled).length;
  const disabled = evals.length - enabled;
  const data = {
    labels: ['Enabled', 'Disabled'],
    datasets: [{ data: [enabled, disabled], backgroundColor: ['#28a745', '#dc3545'] }]
  };
  if (evalActivityChart) evalActivityChart.destroy();
  evalActivityChart = new Chart(canvas.getContext('2d'), {
    type: 'pie',
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        title: { display: true, text: 'Evaluation Activity', font: { size: 16 } },
        tooltip: { enabled: true }
      }
    }
  });
}

/* ---------- Stats & Overview ---------- */
async function refreshStats() {
  const stats = await fetchJSON(`${API_BASE}/stats`);
  document.getElementById('total-flags').textContent = stats.totalFlags;
  document.getElementById('enabled-flags').textContent = stats.enabledFlags;
  document.getElementById('disabled-flags').textContent = stats.disabledFlags;
  document.getElementById('total-evals').textContent = stats.totalEvaluations;
  renderFlagDistributionChart(stats.enabledFlags, stats.disabledFlags);
  renderEvaluationActivityChart(stats.recentEvaluations || []);
}

async function loadHistory() {
  const stats = await fetchJSON(`${API_BASE}/stats`);
  const tbody = document.getElementById('history-body');
  tbody.innerHTML = '';
  if (stats.recentEvaluations) {
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
