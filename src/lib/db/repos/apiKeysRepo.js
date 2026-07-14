import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";

function rowToKey(row) {
  if (!row) return null;
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    machineId: row.machineId,
    isActive: row.isActive === 1 || row.isActive === true,
    defaultPolicy: row.defaultPolicy || "allow",
    createdAt: row.createdAt,
  };
}

export async function getApiKeys() {
  const db = await getAdapter();
  const rows = db.all(`SELECT * FROM apiKeys ORDER BY createdAt ASC`);
  return rows.map(rowToKey);
}

export async function getApiKeyById(id) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM apiKeys WHERE id = ?`, [id]);
  return rowToKey(row);
}

export async function createApiKey(name, machineId) {
  if (!machineId) throw new Error("machineId is required");
  const db = await getAdapter();
  const { generateApiKeyWithMachine } = await import("@/shared/utils/apiKey");
  const result = generateApiKeyWithMachine(machineId);
  const apiKey = {
    id: uuidv4(),
    name,
    key: result.key,
    machineId,
    isActive: true,
    defaultPolicy: "deny",
    createdAt: new Date().toISOString(),
  };
  db.run(
    `INSERT INTO apiKeys(id, key, name, machineId, isActive, defaultPolicy, createdAt) VALUES(?, ?, ?, ?, ?, ?, ?)`,
    [apiKey.id, apiKey.key, apiKey.name, apiKey.machineId, 1, apiKey.defaultPolicy, apiKey.createdAt]
  );
  return apiKey;
}

export async function updateApiKey(id, data) {
  const db = await getAdapter();
  let result = null;
  db.transaction(() => {
    const row = db.get(`SELECT * FROM apiKeys WHERE id = ?`, [id]);
    if (!row) return;
    const merged = { ...rowToKey(row), ...data };
    db.run(
      `UPDATE apiKeys SET key = ?, name = ?, machineId = ?, isActive = ?, defaultPolicy = ? WHERE id = ?`,
      [merged.key, merged.name, merged.machineId, merged.isActive ? 1 : 0, merged.defaultPolicy || "allow", id]
    );
    result = merged;
  });
  return result;
}

export async function deleteApiKey(id) {
  const db = await getAdapter();
  let deleted = false;
  db.transaction(() => {
    const res = db.run(`DELETE FROM apiKeys WHERE id = ?`, [id]);
    deleted = (res?.changes ?? 0) > 0;
    // Cascade: drop any ACL rules owned by this key.
    db.run(`DELETE FROM apiKeyAcl WHERE apiKeyId = ?`, [id]);
  });
  return deleted;
}

export async function validateApiKey(key) {
  const db = await getAdapter();
  const row = db.get(`SELECT isActive FROM apiKeys WHERE key = ?`, [key]);
  if (!row) return false;
  return row.isActive === 1 || row.isActive === true;
}

// ── ACL ──────────────────────────────────────────────────────────────────
// Look up a key by its full key string (used by request-time authorization).
export async function getApiKeyByKey(key) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM apiKeys WHERE key = ?`, [key]);
  return rowToKey(row);
}

function rowToAcl(row) {
  if (!row) return null;
  return {
    id: row.id,
    apiKeyId: row.apiKeyId,
    scope: row.scope,
    mode: row.mode,
    values: parseJson(row.valuesJson, []),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getApiKeyAcl(apiKeyId) {
  const db = await getAdapter();
  const rows = db.all(
    `SELECT * FROM apiKeyAcl WHERE apiKeyId = ? ORDER BY scope, mode`,
    [apiKeyId]
  );
  return rows.map(rowToAcl);
}

// Replace the full ACL rule set for a key.
// rules: [{ scope, mode, values: string[] }]
export async function setApiKeyAcl(apiKeyId, rules = []) {
  const db = await getAdapter();
  const now = new Date().toISOString();
  db.transaction(() => {
    db.run(`DELETE FROM apiKeyAcl WHERE apiKeyId = ?`, [apiKeyId]);
    for (const r of rules) {
      if (!r || !r.scope || !r.mode) continue;
      const values = Array.isArray(r.values) ? r.values : [];
      db.run(
        `INSERT INTO apiKeyAcl(id, apiKeyId, scope, mode, valuesJson, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), apiKeyId, r.scope, r.mode, stringifyJson(values), now, now]
      );
    }
  });
  return await getApiKeyAcl(apiKeyId);
}

export async function deleteApiKeyAcl(apiKeyId) {
  const db = await getAdapter();
  const res = db.run(`DELETE FROM apiKeyAcl WHERE apiKeyId = ?`, [apiKeyId]);
  return (res?.changes ?? 0) > 0;
}

// Allowed services (gate by service type). Keep in sync with SSE handlers.
export const ACL_SERVICES = ["chat", "tts", "stt", "imageGeneration", "embeddings", "fetch", "search"];

/**
 * Evaluate an API key's ACL against a request context.
 * @param {string} apiKeyId - key id
 * @param {{service?: string, provider?: string, connection?: string, model?: string, combo?: string}} ctx
 * @returns {{allowed: boolean, reason?: string}}
 *
 * Semantics per scope:
 *  - If a `deny` list exists and the value is in it → denied.
 *  - If an `allow` list exists (non-empty) and the value is NOT in it → denied.
 *  - A scope with no rules is unrestricted.
 *  - Missing ctx fields are skipped (fail-open on that scope only).
 */
/**
 * Evaluate an API key's ACL against a request context using a waterfall.
 *
 * `service` is a top-level gate (checked independently when rules exist).
 * Resource scopes cascade in priority: combo -> provider -> connection -> model.
 * The FIRST resource scope that has rules AND a value in ctx decides (allow or deny);
 * scopes with no rules (or no value in ctx) fall through. `defaultPolicy` applies
 * only when no resource scope matched.
 *
 * @param {string} apiKeyId
 * @param {{service?: string, provider?: string, connection?: string, model?: string, combo?: string}} ctx
 * @returns {{allowed: boolean, reason?: string}}
 */
export async function checkKeyAccess(apiKeyId, ctx = {}) {
  if (!apiKeyId) return { allowed: true };
  const key = await getApiKeyById(apiKeyId);
  if (!key) return { allowed: false, reason: "API key not found" };
  const rules = await getApiKeyAcl(apiKeyId);
  if (!rules.length) {
    return key.defaultPolicy === "deny"
      ? { allowed: false, reason: "No access has been granted to this API key" }
      : { allowed: true };
  }

  const byScope = new Map();
  for (const r of rules) {
    if (!byScope.has(r.scope)) byScope.set(r.scope, {});
    byScope.get(r.scope)[r.mode] = r.values;
  }

  const isDenied = (sets, value) => Array.isArray(sets?.deny) && sets.deny.length > 0 && sets.deny.includes(value);
  const hasAllow = (sets) => Array.isArray(sets?.allow) && sets.allow.length > 0;

  // 1. Service gate (orthogonal): when service rules exist, the service must be allowed.
  if (ctx.service) {
    const sets = byScope.get("service");
    if (sets) {
      if (isDenied(sets, ctx.service)) return { allowed: false, reason: `Denied service "${ctx.service}" by ACL` };
      if (hasAllow(sets) && !sets.allow.includes(ctx.service)) return { allowed: false, reason: `service "${ctx.service}" not in ACL allow-list` };
    }
  }

  // 2. Resource waterfall: combo -> provider -> connection -> model.
  //    First scope with rules AND a present value decides; the rest fall through.
  for (const scope of ["combo", "provider", "connection", "model"]) {
    const sets = byScope.get(scope);
    if (!sets) continue;
    const value = ctx[scope];
    if (value === undefined || value === null || value === "") continue;
    if (isDenied(sets, value)) return { allowed: false, reason: `Denied ${scope} "${value}" by ACL` };
    if (hasAllow(sets) && !sets.allow.includes(value)) return { allowed: false, reason: `${scope} "${value}" not in ACL allow-list` };
    return { allowed: true };
  }

  // 3. No resource scope matched -> defaultPolicy.
  return key.defaultPolicy === "deny"
    ? { allowed: false, reason: "No access has been granted for this resource" }
    : { allowed: true };
}
