"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Input } from "@/shared/components";

const SCOPES = ["service", "provider", "connection", "model", "combo"];
const label = (value) => value.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

function toState(rules = []) {
  return Object.fromEntries(SCOPES.map((scope) => [scope, new Set(rules.find((r) => r.scope === scope && r.mode === "allow")?.values || [])]));
}

export default function ApiKeyAccessPageClient({ apiKeyId }) {
  const [data, setData] = useState(null);
  const [access, setAccess] = useState({});
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/keys/${apiKeyId}/acl`, { cache: "no-store" });
    if (!res.ok) { setMessage("Unable to load access configuration."); return; }
    const next = await res.json();
    setData(next); setAccess(toState(next.rules));
  }, [apiKeyId]);
  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const toggle = (scope, id) => setAccess((current) => {
    const next = new Set(current[scope] || []);
    next.has(id) ? next.delete(id) : next.add(id);
    return { ...current, [scope]: next };
  });
  const grouped = useMemo(() => {
    const all = data?.catalog?.connections || [];
    return all.filter((c) => `${c.provider} ${c.name} ${c.email || ""}`.toLowerCase().includes(query.toLowerCase())).reduce((out, c) => ({ ...out, [c.provider]: [...(out[c.provider] || []), c] }), {});
  }, [data, query]);
  const save = async () => {
    setSaving(true); setMessage("");
    const rules = SCOPES.map((scope) => ({ scope, mode: "allow", values: [...(access[scope] || [])] })).filter((r) => r.values.length);
    const res = await fetch(`/api/keys/${apiKeyId}/acl`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ defaultPolicy: "deny", rules }) });
    setSaving(false); setMessage(res.ok ? "Access saved." : "Could not save access.");
  };
  if (!data) return <div className="p-6 text-sm text-text-muted">Loading access configuration…</div>;
  return <main className="mx-auto w-full max-w-6xl p-4 sm:p-6 pb-24">
    <div className="mb-6 flex items-start justify-between gap-3"><div><Link href="/dashboard/endpoint" className="text-sm text-primary">← API keys</Link><h1 className="mt-2 text-2xl font-semibold">Access configuration</h1><p className="mt-1 text-sm text-text-muted">Deny by default. Select every service, provider, account, model, and combo this key may use.</p></div><span className="rounded-full bg-red-500/10 px-3 py-1 text-xs font-medium text-red-600">Restricted</span></div>
    <section className="grid gap-4 md:grid-cols-2"><Card className="p-4"><h2 className="font-medium">Services</h2><div className="mt-3 flex flex-wrap gap-2">{data.services.map((service) => <Choice key={service} label={label(service)} selected={access.service?.has(service)} onClick={() => toggle("service", service)} />)}</div></Card><Card className="p-4"><h2 className="font-medium">Combos</h2><div className="mt-3 flex flex-wrap gap-2">{data.catalog.combos.map((combo) => <Choice key={combo.id} label={combo.name} detail={combo.kind} selected={access.combo?.has(combo.name)} onClick={() => toggle("combo", combo.name)} />)}</div></Card></section>
    <Card className="mt-4 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-medium">Providers, accounts & models</h2><p className="text-xs text-text-muted">A direct request can use only an allowed active account.</p></div><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search providers or accounts" className="sm:max-w-xs" /></div><div className="mt-4 space-y-3">{Object.entries(grouped).map(([provider, accounts]) => <div key={provider} className="rounded-xl border border-border p-3"><div className="flex items-center justify-between gap-3"><div><p className="font-medium">{provider}</p><p className="text-xs text-text-muted">{accounts.length} configured account{accounts.length === 1 ? "" : "s"}</p></div><Choice label="Provider" selected={access.provider?.has(provider)} onClick={() => toggle("provider", provider)} /></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{accounts.map((account) => <div key={account.id} className="rounded-lg bg-surface-2 p-3"><Choice label={account.name} detail={account.email || account.authType} selected={access.connection?.has(account.id)} onClick={() => toggle("connection", account.id)} />{account.models.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{account.models.map((model) => <Choice key={model} label={model} selected={access.model?.has(model)} onClick={() => toggle("model", model)} compact />)}</div>}</div>)}</div></div>)}</div></Card>
    <div className="fixed inset-x-0 bottom-0 border-t border-border bg-surface/95 p-3 backdrop-blur"><div className="mx-auto flex max-w-6xl items-center justify-between gap-3"><p className="text-sm text-text-muted">{message}</p><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save access"}</Button></div></div>
  </main>;
}

function Choice({ label: text, detail, selected, onClick, compact = false }) { return <button type="button" onClick={onClick} className={`${compact ? "px-2 py-1 text-xs" : "px-3 py-2 text-sm"} inline-flex items-center gap-2 rounded-lg border transition-colors ${selected ? "border-primary bg-primary/10 text-primary" : "border-border text-text-muted hover:bg-surface-2"}`}><span className="material-symbols-outlined text-base">{selected ? "check_circle" : "add_circle"}</span><span>{text}</span>{detail && <span className="text-xs opacity-70">{detail}</span>}</button>; }
