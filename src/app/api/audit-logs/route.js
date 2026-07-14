import { NextResponse } from "next/server";
import { getAuditLogs, countAuditLogs, getDistinctAuditIps } from "@/lib/localDb";

export const dynamic = "force-dynamic";

// GET /api/audit-logs?ip=&action=&entityType=&entityId=&from=&to=&limit=&offset=
export async function GET(request) {
  try {
    const sp = request.nextUrl?.searchParams || new URL(request.url).searchParams;
    const f = {
      ip: sp.get("ip") || undefined,
      action: sp.get("action") || undefined,
      entityType: sp.get("entityType") || sp.get("entity") || undefined,
      entityId: sp.get("entityId") || undefined,
      from: sp.get("from") || undefined,
      to: sp.get("to") || undefined,
      limit: sp.get("limit") || undefined,
      offset: sp.get("offset") || undefined,
    };
    const [logs, total, ips] = await Promise.all([
      getAuditLogs(f),
      countAuditLogs(f),
      getDistinctAuditIps(),
    ]);
    return NextResponse.json({ logs, total, ips });
  } catch (error) {
    console.log("Error fetching audit logs:", error);
    return NextResponse.json({ error: "Failed to fetch audit logs" }, { status: 500 });
  }
}
