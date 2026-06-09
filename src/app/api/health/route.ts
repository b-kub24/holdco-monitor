import { NextResponse } from "next/server";
import {
  getProducts, getLatestCheck, getRecentChecks,
  getUptimePercent, getAvgResponseTime, getActiveIncidents,
} from "@/lib/db/supabase";
import type { ProductStatus } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const products = await getProducts();
    const statuses: ProductStatus[] = await Promise.all(
      products.map(async (product) => {
        const [latestCheck, recentChecks, uptime24h, uptime7d, uptime30d, avgResponseTime, activeIncidents] = await Promise.all([
          getLatestCheck(product.id),
          getRecentChecks(product.id, 96),
          getUptimePercent(product.id, 24),
          getUptimePercent(product.id, 168),
          getUptimePercent(product.id, 720),
          getAvgResponseTime(product.id),
          getActiveIncidents(product.id),
        ]);
        return { product, latestCheck, uptime24h, uptime7d, uptime30d, avgResponseTime, recentChecks, activeIncidents };
      })
    );
    return NextResponse.json({ ok: true, updatedAt: new Date().toISOString(), products: statuses });
  } catch (err) {
    console.error("[API] Health data error:", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
