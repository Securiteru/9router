import { getClientIp } from "@/lib/auth/loginLimiter";
import { addAuditLog } from "@/lib/localDb";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Keys stripped from before/after snapshots so secrets never land in the audit log.
const SENSITIVE_KEYS = new Set([
  "apiKey", "accessToken", "refreshToken", "idToken",
  "password", "secret", "token", "clientSecret", "apiKeyValue",
  "authorization", "cookie", "key",
  "oidcClientSecret", "mitmSudoEncrypted", "sudoPassword", "currentPassword", "newPassword",
]);

function actionFromMethod(method) {
  if (method === "POST") return "create";
  if (method === "DELETE") return "delete";
  if (method === "PUT" || method === "PATCH") return "update";
  return method.toLowerCase();
}

function stripSecrets(value) {
  if (value == null || typeof value !== "object") return value;
  try {
    const clone = JSON.parse(JSON.stringify(value));
    return _strip(clone);
  } catch {
    return "[unserializable]";
  }
}

function _strip(obj) {
  if (Array.isArray(obj)) return obj.map(_strip);
  if (obj && typeof obj === "object") {
    for (const k of Object.keys(obj)) {
      if (SENSITIVE_KEYS.has(k)) delete obj[k];
      else obj[k] = _strip(obj[k]);
    }
  }
  return obj;
}

function classifyActor(request) {
  try {
    if (request.headers?.get?.("x-9r-cli-token")) return "cli";
    const cookie = request.headers?.get?.("cookie") || "";
    if (cookie.includes("auth_token=")) return "dashboard";
  } catch {}
  return "anonymous";
}

function getRoute(request) {
  try {
    if (request.nextUrl?.pathname) return request.nextUrl.pathname;
  } catch {}
  try {
    return new URL(request.url).pathname;
  } catch {
    return null;
  }
}

function defaultGetId(params, body) {
  if (params?.id) return params.id;
  if (body && typeof body === "object") {
    if (body.id) return body.id;
    for (const k of ["connection", "key", "combo", "pool", "node", "model"]) {
      if (body[k]?.id) return body[k].id;
    }
  }
  return null;
}

/**
 * Wrap a Next.js route handler so mutating calls are recorded in the audit log.
 *
 * @param {string} entityType - e.g. "provider", "apiKey", "settings"
 * @param {Function} handler - the original route handler (request, ctx) => Response
 * @param {{action?: string|Function, getBefore?: Function, getAfter?: Function, getId?: Function}} opts
 * @returns {Function} audited handler
 *
 * - Non-mutating methods (GET/HEAD/OPTIONS) pass through unlogged.
 * - getBefore/getAfter return entity snapshots; withAudit strips secrets and
 *   stores them as a {before, after} diff.
 * - Audit writes are best-effort and never break the underlying request.
 */
export function withAudit(entityType, handler, opts = {}) {
  return async function auditedHandler(request, ctx) {
    const method = (request.method || "GET").toUpperCase();
    if (!MUTATING.has(method)) {
      return handler(request, ctx);
    }

    const ip = getClientIp(request);
    const actor = classifyActor(request);
    const route = getRoute(request);
    const action = typeof opts.action === "function"
      ? opts.action(method)
      : (opts.action || actionFromMethod(method));

    let params = {};
    try {
      if (ctx?.params && typeof ctx.params.then === "function") params = await ctx.params;
      else if (ctx?.params) params = ctx.params;
    } catch {}

    let before = null;
    if (opts.getBefore) {
      try { before = stripSecrets(await opts.getBefore(request, params)); } catch { before = null; }
    }

    let response;
    let status = 500;
    let resultBody = null;
    try {
      response = await handler(request, ctx);
      if (response?.status) status = response.status;
      try { if (response?.clone?.().json) resultBody = await response.clone().json(); } catch {}
    } catch (err) {
      try {
        await addAuditLog({
          timestamp: new Date().toISOString(), method, route, action, entityType,
          entityId: await safeId(opts.getId, params, null) || params.id || null,
          ip, actor, status: 500,
          diff: opts.getBefore ? { before, after: null, error: String(err?.message || err) } : null,
        });
      } catch {}
      throw err;
    }

    let entityId = null;
    try {
      entityId = opts.getId
        ? await safeId(opts.getId, params, resultBody)
        : defaultGetId(params, resultBody);
    } catch {}

    let after = null;
    if (opts.getAfter && status < 400) {
      try { after = stripSecrets(await opts.getAfter(request, params, resultBody)); } catch { after = null; }
    }

    const diff = (opts.getBefore || opts.getAfter) ? { before, after } : null;
    try {
      await addAuditLog({
        timestamp: new Date().toISOString(), method, route, action, entityType,
        entityId, ip, actor, status, diff,
      });
    } catch (e) {
      console.log("audit log write failed:", e);
    }

    return response;
  };
}

async function safeId(fn, params, body) {
  try { return await fn(params, body); } catch { return null; }
}
