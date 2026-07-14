"use client";

import { useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import { Modal, Button, Input } from "@/shared/components";

const SCOPES = [
  { key: "service", label: "Service types", hint: "chat, tts, stt, imageGeneration, embeddings, fetch, search" },
  { key: "provider", label: "Providers", hint: "e.g. openai, anthropic, gemini, kiro" },
  { key: "model", label: "Models", hint: "e.g. gpt-4o, claude-3-7-sonnet, gemini-2.0-flash" },
];

const MODES = [
  { key: "none", label: "Off" },
  { key: "allow", label: "Allow list" },
  { key: "deny", label: "Deny list" },
];

const SERVICE_OPTIONS = ["chat", "tts", "stt", "imageGeneration", "embeddings", "fetch", "search"];

function emptyState() {
  return {
    service: { mode: "none", values: [] },
    provider: { mode: "none", values: [] },
    model: { mode: "none", values: [] },
  };
}

function rulesToState(rules = []) {
  const state = emptyState();
  for (const r of rules) {
    if (!state[r.scope]) continue;
    state[r.scope].mode = r.mode;
    state[r.scope].values = Array.isArray(r.values) ? r.values : [];
  }
  return state;
}

function stateToRules(state) {
  const out = [];
  for (const s of SCOPES) {
    const cfg = state[s.key];
    if (!cfg || cfg.mode === "none") continue;
    out.push({ scope: s.key, mode: cfg.mode, values: cfg.values });
  }
  return out;
}

export default function ApiKeyAclModal({ apiKeyId, apiKeyName, isOpen, onClose, onSaved }) {
  const [state, setState] = useState(emptyState());
  const [services, setServices] = useState(SERVICE_OPTIONS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [providerText, setProviderText] = useState("");
  const [modelText, setModelText] = useState("");

  const load = useCallback(async () => {
    if (!apiKeyId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/keys/${apiKeyId}/acl`);
      if (!res.ok) throw new Error("Failed to load ACL");
      const data = await res.json();
      if (data.services) setServices(data.services);
      const next = rulesToState(data.rules || []);
      setState(next);
      setProviderText(next.provider.values.join(", "));
      setModelText(next.model.values.join(", "));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [apiKeyId]);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  const setMode = (scope, mode) => {
    setState((prev) => ({ ...prev, [scope]: { ...prev[scope], mode } }));
  };

  const toggleService = (svc) => {
    setState((prev) => {
      const values = prev.service.values.includes(svc)
        ? prev.service.values.filter((v) => v !== svc)
        : [...prev.service.values, svc];
      return { ...prev, service: { ...prev.service, values } };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const next = {
        ...state,
        provider: { ...state.provider, values: providerText.split(",").map((s) => s.trim()).filter(Boolean) },
        model: { ...state.model, values: modelText.split(",").map((s) => s.trim()).filter(Boolean) },
      };
      const res = await fetch(`/api/keys/${apiKeyId}/acl`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: stateToRules(next) }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to save ACL");
      }
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    setError("");
    try {
      await fetch(`/api/keys/${apiKeyId}/acl`, { method: "DELETE" });
      const next = emptyState();
      setState(next);
      setProviderText("");
      setModelText("");
      onSaved?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      title={`Access rules — ${apiKeyName || "API key"}`}
      onClose={onClose}
    >
      <div className="flex flex-col gap-5">
        <p className="text-sm text-text-muted">
          Restrict what this API key can call. A key with all scopes off is unrestricted.
          Within a scope, <span className="font-medium">Allow</span> whitelists and{" "}
          <span className="font-medium">Deny</span> blacklists; deny wins.
        </p>

        {loading ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : (
          SCOPES.map((s) => {
            const cfg = state[s.key];
            return (
              <div key={s.key} className="flex flex-col gap-2 border-t border-border pt-4 first:border-t-0 first:pt-0">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{s.label}</p>
                    <p className="text-xs text-text-muted">{s.hint}</p>
                  </div>
                  <div className="flex gap-1">
                    {MODES.map((m) => (
                      <button
                        key={m.key}
                        onClick={() => setMode(s.key, m.key)}
                        className={`text-xs px-2.5 py-1 rounded transition-colors ${
                          cfg.mode === m.key
                            ? m.key === "allow"
                              ? "bg-green-500/15 text-green-600 dark:text-green-400"
                              : m.key === "deny"
                                ? "bg-red-500/15 text-red-600 dark:text-red-400"
                                : "bg-surface-2 text-text-muted"
                            : "text-text-muted hover:bg-black/5 dark:hover:bg-white/5"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {cfg.mode !== "none" && (
                  s.key === "service" ? (
                    <div className="flex flex-wrap gap-1.5">
                      {services.map((svc) => {
                        const on = cfg.values.includes(svc);
                        return (
                          <button
                            key={svc}
                            onClick={() => toggleService(svc)}
                            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                              on
                                ? cfg.mode === "allow"
                                  ? "border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400"
                                  : "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400"
                                : "border-border text-text-muted hover:bg-black/5 dark:hover:bg-white/5"
                            }`}
                          >
                            {svc}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <Input
                      value={s.key === "provider" ? providerText : modelText}
                      onChange={(e) => (s.key === "provider" ? setProviderText(e.target.value) : setModelText(e.target.value))}
                      placeholder={`Comma-separated ${s.label.toLowerCase()}`}
                      className="font-mono text-sm"
                    />
                  )
                )}
              </div>
            );
          })
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex gap-2">
          <Button onClick={handleSave} fullWidth disabled={loading || saving}>
            {saving ? "Saving…" : "Save rules"}
          </Button>
          <Button onClick={handleClear} variant="ghost" disabled={loading || saving}>
            Clear all
          </Button>
          <Button onClick={onClose} variant="ghost">
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}

ApiKeyAclModal.propTypes = {
  apiKeyId: PropTypes.string,
  apiKeyName: PropTypes.string,
  isOpen: PropTypes.bool,
  onClose: PropTypes.func,
  onSaved: PropTypes.func,
};
