# Switchly

A lightweight, developer‑friendly **feature flag management toolkit** for Node.js applications. It provides an in‑memory flag manager with support for:

* Simple Boolean flags
* Environment‑specific flag sets
* User‑ID targeting
* Attribute‑based targeting
* Deterministic percentage roll‑outs
* Evaluation reason codes for debugging

The library is written in pure JavaScript (ESM) and can be consumed from both ESM and CommonJS projects.

---

## Installation

```bash
npm install @mritunjay07/switchly
```

---

## Usage

### ESM

```js
import { createSwitchly, EvaluationReason } from '@mritunjay07/switchly';

const manager = createSwitchly();
manager.registerFlag({ key: 'new-ui', enabled: true });

const result = manager.evaluate('new-ui', {
  userId: 'user-123',
  environment: 'development',
  attributes: { role: 'admin' },
});

console.log(result.enabled); // true
console.log(result.reason); // EvaluationReason.STATIC_ENABLED
```

### CommonJS

```js
const { createSwitchly, EvaluationReason } = require('@mritunjay07/switchly');

const manager = createSwitchly();
manager.registerFlag('beta-feature', false, 'staging'); // register in a specific env

const { enabled, reason } = manager.evaluate('beta-feature', {
  userId: 'u42',
  environment: 'staging',
});

console.log(enabled, reason);
```

---

## API

| Function / Method | Description |
|-------------------|-------------|
| `createSwitchly()` | Returns a new `FeatureFlagManager` instance. |
| `manager.registerFlag(keyOrConfig, enabledOrEnv?, envOrOverwrite?, maybeOverwrite?)` | Register a flag. Accepts a simple key/boolean signature or a full configuration object. Optional environment and overwrite flag can be supplied. |
| `manager.getFlag(key, env = 'development')` | Returns a **deep‑frozen** copy of the flag configuration or `undefined` if not found. |
| `manager.isEnabled(key, env = 'development')` | Convenience boolean check – true only when the flag configuration contains `enabled: true`. |
| `manager.updateFlag(keyOrConfig, enabledOrEnv?, envOrOverwrite?, maybeOverwrite?)` | Update an existing flag (or create it if missing). Works with the same flexible signature as `registerFlag`. |
| `manager.removeFlag(key, env = 'development')` | Delete a flag from the specified environment. |
| `manager.listFlags(env = 'development')` | Return an array of **all flag configurations** for the given environment. |
| `manager.getAllFlags()` | Alias for `listFlags` using the manager’s current default environment. |
| `manager.setEnvironment(env)` | Set the default environment used by methods that omit an explicit `env` argument. |
| `manager.getEnvironment()` | Retrieve the current default environment. |
| `manager.evaluate(key, context)` | Evaluate a flag for a particular user/context. Returns an object `{ flagKey, enabled, reason, environment }`. The `reason` uses the `EvaluationReason` enum. |

### Configuration object shape

```ts
interface FlagConfig {
  key: string;                // required
  enabled?: boolean;          // static boolean flag
  rolloutPercentage?: number; // 0‑100 inclusive
  targets?: Array<{           // optional targeting rules
    userId?: string;
    attributes?: Record<string, any>;
  }>;
}
```

### Evaluation Reason Codes

* `STATIC_ENABLED` – flag has `enabled: true`.
* `STATIC_DISABLED` – flag has `enabled: false`.
* `TARGET_MATCH` – a target rule matched the supplied user/context.
* `PERCENTAGE_ROLLOUT` – result of a deterministic rollout.
* `DEFAULT_VALUE` – no matching rule; default is `false`.
* `FLAG_NOT_FOUND` – flag does not exist in the requested environment.

---

## Examples

### Environment‑specific flags

```js
const mgr = createSwitchly();
mgr.registerFlag('feature-x', true, 'production'); // only enabled in prod
mgr.registerFlag('feature-x', false, 'development');

console.log(mgr.isEnabled('feature-x', 'production')); // true
console.log(mgr.isEnabled('feature-x', 'development')); // false
```

### User‑ID targeting

```js
mgr.registerFlag({
  key: 'beta-access',
  targets: [{ userId: 'alice' }, { userId: 'bob' }]
});

const res = mgr.evaluate('beta-access', { userId: 'alice', environment: 'development' });
console.log(res.enabled); // true, reason = TARGET_MATCH
```

### Attribute targeting

```js
mgr.registerFlag({
  key: 'admin-panel',
  targets: [{ attributes: { role: 'admin' } }]
});

const ctx = { userId: 'u1', environment: 'development', attributes: { role: 'admin' } };
console.log(mgr.evaluate('admin-panel', ctx).enabled); // true
```

### Percentage rollout

```js
mgr.registerFlag({ key: 'new-algo', rolloutPercentage: 25 });

// Deterministic – the same userId always gets the same result
const r = mgr.evaluate('new-algo', { userId: 'user-42', environment: 'development' });
console.log(r.enabled, r.reason); // true/false + PERCENTAGE_ROLLOUT
```

---

## Error handling & limitations

* The manager validates flag configurations on registration and update. Invalid keys, non‑boolean `enabled`, or out‑of‑range `rolloutPercentage` throw an error.
* Target rules must contain a string `userId` or an object `attributes`. Invalid target structures throw.
* All data is kept **in‑memory**; there is no persistence or remote storage.
* The library does **not** provide A/B testing, remote flag services, or server‑side synchronization – it is intended for simple, local feature‑flag scenarios.

---

## License

MIT © 2026 Mritunjay Sahu
