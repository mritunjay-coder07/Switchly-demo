// server.js
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createSwitchly, EvaluationReason } from '@mritunjay07/switchly';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cors()); // allow front‑end to call API if served separately
app.use(express.static(path.join(__dirname, 'public')));

// Feature flag manager
const manager = createSwitchly();

// In‑memory evaluation statistics
const stats = {
  totalEvaluations: 0,
  enabledEvaluations: 0,
  disabledEvaluations: 0,
  reasons: {},
  evaluationHistory: [], // limited to recent 50 entries
};

function recordEval(result) {
  stats.totalEvaluations++;
  if (result.enabled) stats.enabledEvaluations++; else stats.disabledEvaluations++;
  const r = result.reason || 'UNKNOWN';
  stats.reasons[r] = (stats.reasons[r] || 0) + 1;
  stats.evaluationHistory.unshift({
    key: result.flagKey,
    userId: result.userId,
    environment: result.environment,
    enabled: result.enabled,
    reason: result.reason,
    timestamp: new Date().toISOString(),
  });
  if (stats.evaluationHistory.length > 50) stats.evaluationHistory.pop();
}

// Sample flags (registered on start)
const sampleFlags = [
  { key: 'new-dashboard', enabled: false },
  { key: 'dark-mode', enabled: true },
  { key: 'beta-checkout', rolloutPercentage: 30 },
  { key: 'ai-recommendations', targets: [{ attributes: { role: 'admin' } }] },
  { key: 'new-onboarding', enabled: true },
];

for (const cfg of sampleFlags) {
  manager.registerFlag(cfg, 'development', true);
}

// ------- API Endpoints ----------------------------------------------------

// Get all flags (current environment)
app.get('/api/flags', (req, res) => {
  const env = req.query.env || manager.getEnvironment();
  res.json(manager.listFlags(env));
});

// Register a new flag
app.post('/api/flags', (req, res) => {
  const { key, enabled, rolloutPercentage, targets, env, overwrite } = req.body;
  try {
    manager.registerFlag({ key, enabled, rolloutPercentage, targets }, env || manager.getEnvironment(), overwrite ?? false);
    res.status(201).json({ message: 'Flag registered' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Get specific flag
app.get('/api/flags/:key', (req, res) => {
  const env = req.query.env || manager.getEnvironment();
  const flag = manager.getFlag(req.params.key, env);
  if (!flag) return res.status(404).json({ error: 'Flag not found' });
  res.json(flag);
});

// Update flag
app.patch('/api/flags/:key', (req, res) => {
  const { enabled, rolloutPercentage, targets, env } = req.body;
  try {
    manager.updateFlag({ key: req.params.key, enabled, rolloutPercentage, targets }, env || manager.getEnvironment(), true);
    res.json({ message: 'Flag updated' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Delete flag
app.delete('/api/flags/:key', (req, res) => {
  const env = req.query.env || manager.getEnvironment();
  manager.removeFlag(req.params.key, env);
  res.json({ message: 'Flag removed' });
});

// Evaluate flag
app.post('/api/evaluate/:key', (req, res) => {
  const { userId, attributes, environment } = req.body;
  const env = environment || manager.getEnvironment();
  const result = manager.evaluate(req.params.key, { userId, attributes, environment: env });
  // add extra fields for history
  const enriched = { ...result, userId };
  recordEval(enriched);
  res.json(enriched);
});

// Get supported environments (demo uses static list)
app.get('/api/environments', (req, res) => {
  res.json(['development', 'staging', 'production']);
});

// Switch active environment
app.post('/api/environment', (req, res) => {
  const { environment } = req.body;
  try {
    manager.setEnvironment(environment);
    res.json({ message: `Default environment set to ${environment}` });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Statistics endpoint
app.get('/api/stats', (req, res) => {
  const totalFlags = manager.getAllFlags().length;
  const enabledFlags = manager.getAllFlags().filter(f => f.enabled === true).length;
  const disabledFlags = totalFlags - enabledFlags;
  res.json({
    totalFlags,
    enabledFlags,
    disabledFlags,
    totalEvaluations: stats.totalEvaluations,
    enabledEvaluations: stats.enabledEvaluations,
    disabledEvaluations: stats.disabledEvaluations,
    reasonDistribution: stats.reasons,
    recentEvaluations: stats.evaluationHistory,
    currentEnvironment: manager.getEnvironment(),
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Switchly demo server listening on http://localhost:${PORT}`);
});
