import { NextResponse } from "next/server";
import { getApiKeyById, getApiKeyAcl, setApiKeyAcl, deleteApiKeyAcl, ACL_SERVICES } from "@/lib/localDb";

export const dynamic = "force-dynamic";

const VALID_SCOPES = new Set(["service", "provider", "model"]);
const VALID_MODES = new Set(["allow", "deny"]);

function normalizeRules(input) {
  if (!Array.isArray(input)) return { error: "rules must be an array" };
  const rules = [];
  for (const r of input) {
    if (!r || typeof r !== "object") continue;
    const scope = String(r.scope || "").trim();
    const mode = String(r.mode || "").trim();
    if (!VALID_SCOPES.has(scope)) return { error: `invalid scope: ${scope || "(empty)"}` };
    if (!VALID_MODES.has(mode)) return { error: `invalid mode: ${mode || "(empty)"}` };
    const values = Array.isArray(r.values)
      ? r.values.map((v) => String(v)).filter(Boolean)
      : [];
    rules.push({ scope, mode, values });
  }
  return { rules };
}

// GET /api/keys/[id]/acl - List ACL rules for a key
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const key = await getApiKeyById(id);
    if (!key) return NextResponse.json({ error: "Key not found" }, { status: 404 });
    const rules = await getApiKeyAcl(id);
    return NextResponse.json({ rules, services: ACL_SERVICES });
  } catch (error) {
    console.log("Error fetching key ACL:", error);
    return NextResponse.json({ error: "Failed to fetch ACL" }, { status: 500 });
  }
}

// PUT /api/keys/[id]/acl - Replace the full ACL rule set for a key
export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const key = await getApiKeyById(id);
    if (!key) return NextResponse.json({ error: "Key not found" }, { status: 404 });

    const body = await request.json();
    const { rules, error } = normalizeRules(body.rules);
    if (error) return NextResponse.json({ error }, { status: 400 });

    const saved = await setApiKeyAcl(id, rules);
    return NextResponse.json({ rules: saved });
  } catch (error) {
    console.log("Error saving key ACL:", error);
    return NextResponse.json({ error: "Failed to save ACL" }, { status: 500 });
  }
}

// DELETE /api/keys/[id]/acl - Clear all ACL rules (key becomes unrestricted)
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const key = await getApiKeyById(id);
    if (!key) return NextResponse.json({ error: "Key not found" }, { status: 404 });
    await deleteApiKeyAcl(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.log("Error clearing key ACL:", error);
    return NextResponse.json({ error: "Failed to clear ACL" }, { status: 500 });
  }
}
