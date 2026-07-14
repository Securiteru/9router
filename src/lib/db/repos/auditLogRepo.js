import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";

function rowToAudit(row) {
  if (!row) return null;
  return {
    id: row.id,
    timestamp: row.timestamp,
    method: row.method,
    route: row.route,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    ip: row.ip,
    actor: row.actor,
    status: row.status,
    diff: parseJson(row.diff, null),
    meta: parseJson(row.meta, null),
  };
}

export async function addAuditLog(entry) {
  const db = await getAdapter();
  const now = new Date().toISOString();
  const row = {
    id: entry.id || uuidv4(),
    timestamp: entry.timestamp || now,
    method: entry.method || null,
    route: entry.route || null,
    action: entry.action || null,
    entityType: entry.entityType || null,
    entityId: entry.entityId || null,
    ip: entry.ip || null,
    actor: entry.actor || null,
    status: typeof entry.status === "number" ? entry.status : null,
    diff: entry.diff != null ? stringifyJson(entry.diff) : null,
    meta: entry.meta != null ? stringifyJson(entry.meta) : null,
  };
  db.run(
    `INSERT INTO auditLog(id, timestamp, method, route, action, entityType, entityId, ip, actor, status, diff, meta)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.timestamp, row.method, row.route, row.action, row.entityType, row.entityId, row.ip, row.actor, row.status, row.diff, row.meta]
  );
  return row.id;
}

/**
 * Query audit logs with optional filters.
 * @param {{ip?: string, action?: string, entityType?: string, entityId?: string, from?: string, to?: string, limit?: number, offset?: number}} f
 */
export async function getAuditLogs(f = {}) {
  const db = await getAdapter();
  const where = [];
  const args = [];
  if (f.ip) { where.push("ip = ?"); args.push(f.ip); }
  if (f.action) { where.push("action = ?"); args.push(f.action); }
  if (f.entityType) { where.push("entityType = ?"); args.push(f.entityType); }
  if (f.entityId) { where.push("entityId = ?"); args.push(f.entityId); }
  if (f.from) { where.push("timestamp >= ?"); args.push(f.from); }
  if (f.to) { where.push("timestamp <= ?"); args.push(f.to); }
  const sql = `SELECT * FROM auditLog${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
  const limit = Math.min(Math.max(Number(f.limit) || 100, 1), 500);
  const offset = Math.max(Number(f.offset) || 0, 0);
  args.push(limit, offset);
  return db.all(sql, args).map(rowToAudit);
}

export async function countAuditLogs(f = {}) {
  const db = await getAdapter();
  const where = [];
  const args = [];
  if (f.ip) { where.push("ip = ?"); args.push(f.ip); }
  if (f.action) { where.push("action = ?"); args.push(f.action); }
  if (f.entityType) { where.push("entityType = ?"); args.push(f.entityType); }
  if (f.entityId) { where.push("entityId = ?"); args.push(f.entityId); }
  if (f.from) { where.push("timestamp >= ?"); args.push(f.from); }
  if (f.to) { where.push("timestamp <= ?"); args.push(f.to); }
  const sql = `SELECT COUNT(*) AS c FROM auditLog${where.length ? ` WHERE ${where.join(" AND ")}` : ""}`;
  const row = db.get(sql, args);
  return row?.c ?? 0;
}

export async function getDistinctAuditIps() {
  const db = await getAdapter();
  return db.all(`SELECT DISTINCT ip FROM auditLog WHERE ip IS NOT NULL ORDER BY ip`).map((r) => r.ip);
}
