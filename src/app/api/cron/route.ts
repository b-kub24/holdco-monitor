import { NextRequest, NextResponse } from "next/server";
import { products, productMap } from "@/lib/config/products";
import { checkAllProducts } from "@/lib/checker/health-check";
import { upsertProducts, insertHealthCheck, pruneOldChecks } from "@/lib/db/supabase";
import { processAlerts } from "@/lib/alerts/telegram";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const startTime = Date.now();
  const errors: string[] = [];
  try {
    await upsertProducts(products);
    const results = await checkAllProducts(products);
    for (const result of results) {
      try { await insertHealthCheck(result); } catch (err) {
        errors.push(`DB insert failed for ${result.productId}: ${err instanceof Error ? err.message : String(err)}`);
      }
      try {
        const product = productMap.get(result.productId);
        if (product) { await processAlerts(product, result); }
      } catch (err) {
        errors.push(`Alert failed for ${result.productId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    try { await pruneOldChecks(90); } catch (err) {
      errors.push(`Pruning failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    const duration = Date.now() - startTime;
    const summary = {
      ok: errors.length === 0, checkedAt: new Date().toISOString(), duration: `${duration}ms`,
      products: results.length,
      healthy: results.filter((r) => r.status === "healthy").length,
      degraded: results.filter((r) => r.status === "degraded").length,
      down: results.filter((r) => r.status === "down").length,
      errors: errors.length > 0 ? errors : undefined,
      results: results.map((r) => ({ id: r.productId, status: r.status, http: r.httpStatus, time: `${r.responseTime}ms`, ssl: r.sslDaysRemaining !== null ? `${r.sslDaysRemaining}d` : "N/A" })),
    };
    console.log("[Cron] Health check complete:", JSON.stringify(summary));
    return NextResponse.json(summary, { status: errors.length > 0 ? 207 : 200 });
  } catch (err) {
    console.error("[Cron] Fatal error:", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
