import { createClient } from "@supabase/supabase-js";
import type {
  DBProduct,
  DBHealthCheck,
  DBIncident,
  HealthCheckResult,
  Product,
} from "@/lib/types";

// âââ Client Setup âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** Server-side client with service role (bypasses RLS) */
export const supabase = createClient(supabaseUrl, supabaseServiceKey);

/** Public client for dashboard (uses anon key, respects RLS) */
export function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// âââ Product Operations âââââââââââââââââââââââââââââââââââââââââââââââââââââ

export async function upsertProducts(products: Product[]) {
  const rows = products.map((p) => ({
    id: p.id,
    name: p.name,
    url: p.url,
    check_interval: p.checkInterval,
    category: p.category,
  }));

  const { error } = await supabase.from("products").upsert(rows, {
    onConflict: "id",
  });

  if (error) throw new Error(`Failed to upsert products: ${error.message}`);
}

export async function getProducts(): Promise<DBProduct[]> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("name");

  if (error) throw new Error(`Failed to fetch products: ${error.message}`);
  return data ?? [];
}

// âââ Health Check Operations ââââââââââââââââââââââââââââââââââââââââââââââââ

export async function insertHealthCheck(result: HealthCheckResult) {
  const { error } = await supabase.from("health_checks").insert({
    product_id: result.productId,
    status: result.status,
    http_status: result.httpStatus,
    response_time: result.responseTime,
    ssl_days_remaining: result.sslDaysRemaining,
    ssl_valid: result.sslValid,
    error_messages: result.errorStrings.length > 0 ? result.errorStrings : null,
    checked_at: result.checkedAt,
  });

  if (error)
    throw new Error(`Failed to insert health check: ${error.message}`);
}

export async function getLatestCheck(
  productId: string
): Promise<DBHealthCheck | null> {
  const { data, error } = await supabase
    .from("health_checks")
    .select("*")
    .eq("product_id", productId)
    .order("checked_at", { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Failed to fetch latest check: ${error.message}`);
  }
  return data ?? null;
}

export async function getRecentChecks(
  productId: string,
  limit: number = 96 // 24h of 15-min checks
): Promise<DBHealthCheck[]> {
  const { data, error } = await supabase
    .from("health_checks")
    .select("*")
    .eq("product_id", productId)
    .order("checked_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to fetch recent checks: ${error.message}`);
  return data ?? [];
}

export async function getChecksInWindow(
  productId: string,
  hoursAgo: number
): Promise<DBHealthCheck[]> {
  const since = new Date(
    Date.now() - hoursAgo * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await supabase
    .from("health_checks")
    .select("*")
    .eq("product_id", productId)
    .gte("checked_at", since)
    .order("checked_at", { ascending: false });

  if (error)
    throw new Error(`Failed to fetch checks in window: ${error.message}`);
  return data ?? [];
}

/** Calculate uptime percentage for a given window */
export async function getUptimePercent(
  productId: string,
  hoursAgo: number
): Promise<number> {
  const checks = await getChecksInWindow(productId, hoursAgo);
  if (checks.length === 0) return 100; // No data = assume up
  const healthy = checks.filter((c) => c.status === "healthy").length;
  return Math.round((healthy / checks.length) * 10000) / 100;
}

/** Average response time over recent checks */
export async function getAvgResponseTime(
  productId: string,
  limit: number = 96
): Promise<number> {
  const checks = await getRecentChecks(productId, limit);
  if (checks.length === 0) return 0;
  const total = checks.reduce((sum, c) => sum + c.response_time, 0);
  return Math.round(total / checks.length);
}

// âââ Incident Operations ââââââââââââââââââââââââââââââââââââââââââââââââââââ

export async function getActiveIncident(
  productId: string,
  type?: string
): Promise<DBIncident | null> {
  let query = supabase
    .from("incidents")
    .select("*")
    .eq("product_id", productId)
    .is("resolved_at", null);

  if (type) query = query.eq("type", type);

  const { data, error } = await query
    .order("started_at", { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Failed to fetch active incident: ${error.message}`);
  }
  return data ?? null;
}

export async function openIncident(
  productId: string,
  type: DBIncident["type"],
  details: string
): Promise<DBIncident> {
  const { data, error } = await supabase
    .from("incidents")
    .insert({
      product_id: productId,
      type,
      details,
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to open incident: ${error.message}`);
  return data;
}

export async function resolveIncident(incidentId: string) {
  const { error } = await supabase
    .from("incidents")
    .update({ resolved_at: new Date().toISOString() })
    .eq("id", incidentId);

  if (error) throw new Error(`Failed to resolve incident: ${error.message}`);
}

export async function getRecentIncidents(
  limit: number = 20
): Promise<(DBIncident & { products: { name: string } | null })[]> {
  const { data, error } = await supabase
    .from("incidents")
    .select("*, products(name)")
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error)
    throw new Error(`Failed to fetch recent incidents: ${error.message}`);
  return data ?? [];
}

export async function getActiveIncidents(
  productId: string
): Promise<DBIncident[]> {
  const { data, error } = await supabase
    .from("incidents")
    .select("*")
    .eq("product_id", productId)
    .is("resolved_at", null)
    .order("started_at", { ascending: false });

  if (error)
    throw new Error(`Failed to fetch active incidents: ${error.message}`);
  return data ?? [];
}

// âââ Cleanup ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

/** Delete health checks older than N days to keep DB lean */
export async function pruneOldChecks(daysToKeep: number = 90) {
  const cutoff = new Date(
    Date.now() - daysToKeep * 24 * 60 * 60 * 1000
  ).toISOString();

  const { error } = await supabase
    .from("health_checks")
    .delete()
    .lt("checked_at", cutoff);

  if (error) throw new Error(`Failed to prune old checks: ${error.message}`);
}
