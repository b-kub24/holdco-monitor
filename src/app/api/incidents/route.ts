import { NextResponse } from "next/server";
import { getRecentIncidents } from "@/lib/db/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const incidents = await getRecentIncidents(50);
    return NextResponse.json({
      ok: true,
      incidents: incidents.map((inc) => ({
        id: inc.id,
        productId: inc.product_id,
        productName: (inc.products as { name: string } | null)?.name ?? inc.product_id,
        type: inc.type,
        details: inc.details,
        startedAt: inc.started_at,
        resolvedAt: inc.resolved_at,
        isActive: inc.resolved_at === null,
        duration: inc.resolved_at
          ? Math.round((new Date(inc.resolved_at).getTime() - new Date(inc.started_at).getTime()) / 60000)
          : Math.round((Date.now() - new Date(inc.started_at).getTime()) / 60000),
      })),
    });
  } catch (err) {
    console.error("[API] Incidents error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
