"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, Button, Input, Select, CardSkeleton } from "@/shared/components";

const PAGE_SIZE = 50;
const ACTIONS = ["create", "update", "delete"];
const ENTITY_TYPES = ["provider", "apiKey", "apiKeyAcl", "combo", "settings"];

function fmtDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function statusColor(status) {
  if (!status) return "text-text-muted";
  if (status < 300) return "text-green-600 dark:text-green-400";
  if (status < 400) return "text-text-muted";
  if (status < 500) return "text-amber-500";
  return "text-red-500";
}

function actionColor(action) {
  if (action === "create") return "bg-green-500/10 text-green-600 dark:text-green-400";
  if (action === "delete") return "bg-red-500/10 text-red-600 dark:text-red-400";
  return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
}

function DiffView({ diff }) {
  if (!diff) return <span className="text-xs text-text-muted">—</span>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 w-full">
      <div>
        <p className="text-[11px] font-semibold text-text-muted mb-1">BEFORE</p>
        <pre className="text-[11px] font-mono bg-surface-2 rounded p-2 overflow-auto max-h-60 whitespace-pre-wrap break-all">
          {diff.before ? JSON.stringify(diff.before, null, 2) : "—"}
        </pre>
      </div>
      <div>
        <p className="text-[11px] font-semibold text-text-muted mb-1">AFTER</p>
        <pre className="text-[11px] font-mono bg-surface-2 rounded p-2 overflow-auto max-h-60 whitespace-pre-wrap break-all">
          {diff.after ? JSON.stringify(diff.after, null, 2) : "—"}
        </pre>
      </div>
      {diff.error && (
        <p className="text-[11px] text-red-500 md:col-span-2">error: {diff.error}</p>
      )}
    </div>
  );
}

export default function AuditLogPageClient() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [ips, setIps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState(new Set());

  // filters
  const [ip, setIp] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const buildQuery = useCallback((p) => {
    const sp = new URLSearchParams();
    if (ip) sp.set("ip", ip);
    if (action) sp.set("action", action);
    if (entityType) sp.set("entityType", entityType);
    if (from) sp.set("from", new Date(from).toISOString());
    if (to) sp.set("to", new Date(to).toISOString());
    sp.set("limit", String(PAGE_SIZE));
    sp.set("offset", String(p * PAGE_SIZE));
    return sp.toString();
  }, [ip, action, entityType, from, to]);

  const fetchLogs = useCallback(async (p) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/audit-logs?${buildQuery(p)}`, { cache: "no-store" });
      const data = await res.json();
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setIps(data.ips || []);
    } catch (e) {
      console.log("audit log fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    fetchLogs(page);
  }, [page, fetchLogs]);

  const applyFilters = () => {
    setPage(0);
    fetchLogs(0);
  };

  const clearFilters = () => {
    setIp(""); setAction(""); setEntityType(""); setFrom(""); setTo("");
    setPage(0);
    setTimeout(() => fetchLogs(0), 0);
  };

  const toggleExpand = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">history</span>
            Audit Log
          </h2>
          <span className="text-sm text-text-muted">{total} entries</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          <Input label="IP" value={ip} onChange={(e) => setIp(e.target.value)} placeholder="any" />
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-muted">Action</label>
            <Select value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">any</option>
              {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-muted">Entity</label>
            <Select value={entityType} onChange={(e) => setEntityType(e.target.value)}>
              <option value="">any</option>
              {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </div>
          <Input label="From" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="To" type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
          <div className="flex items-end gap-2">
            <Button size="sm" onClick={applyFilters}>Apply</Button>
            <Button size="sm" variant="ghost" onClick={clearFilters}>Clear</Button>
          </div>
        </div>

        {ips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            <span className="text-xs text-text-muted self-center">Recent IPs:</span>
            {ips.slice(0, 12).map((recentIp) => (
              <button
                key={recentIp}
                onClick={() => { setIp(recentIp); }}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${ip === recentIp ? "border-primary bg-primary/10 text-primary" : "border-border text-text-muted hover:bg-black/5 dark:hover:bg-white/5"}`}
              >
                {recentIp}
              </button>
            ))}
          </div>
        )}
      </Card>

      {loading ? (
        <CardSkeleton />
      ) : logs.length === 0 ? (
        <Card>
          <div className="text-center py-12 text-text-muted">
            <span className="material-symbols-outlined text-[32px] mb-2 block">inbox</span>
            No audit entries match these filters.
          </div>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-text-muted border-b border-border">
                  <th className="py-2 pr-3">Time</th>
                  <th className="py-2 pr-3">Action</th>
                  <th className="py-2 pr-3">Entity</th>
                  <th className="py-2 pr-3">IP</th>
                  <th className="py-2 pr-3">Actor</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Route</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const isOpen = expanded.has(log.id);
                  return (
                    <>
                      <tr
                        key={log.id}
                        className="border-b border-black/[0.03] dark:border-white/[0.03] cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                        onClick={() => toggleExpand(log.id)}
                      >
                        <td className="py-2 pr-3 whitespace-nowrap text-xs">{fmtDate(log.timestamp)}</td>
                        <td className="py-2 pr-3">
                          <span className={`text-xs px-2 py-0.5 rounded ${actionColor(log.action)}`}>{log.action}</span>
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          <span className="text-xs font-medium">{log.entityType}</span>
                          {log.entityId && <span className="text-xs text-text-muted ml-1 font-mono">{String(log.entityId).slice(0, 8)}</span>}
                        </td>
                        <td className="py-2 pr-3 font-mono text-xs">{log.ip || "—"}</td>
                        <td className="py-2 pr-3 text-xs">{log.actor || "—"}</td>
                        <td className={`py-2 pr-3 text-xs font-medium ${statusColor(log.status)}`}>{log.status || "—"}</td>
                        <td className="py-2 pr-3 font-mono text-xs text-text-muted">{log.method} {log.route}</td>
                        <td className="py-2 text-text-muted">
                          <span className="material-symbols-outlined text-[16px]">{isOpen ? "expand_less" : "expand_more"}</span>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-surface-1/50">
                          <td colSpan={8} className="py-3">
                            <DiffView diff={log.diff} />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-4 mt-2 border-t border-border">
            <span className="text-xs text-text-muted">
              Page {page + 1} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Prev</Button>
              <Button size="sm" variant="ghost" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
