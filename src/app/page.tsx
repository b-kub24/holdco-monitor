"use client";

import { useEffect, useState, useCallback } from "react";

// âââ Types (client-side mirrors) ââââââââââââââââââââââââââââââââââââââââââââ

interface ProductCheck {
  status: "healthy" | "degraded" | "down";
  http_status: number | null;
  response_time: number;
  ssl_days_remaining: number | null;
  ssl_valid: boolean;
  error_messages: string[] | null;
  checked_at: string;
}

interface ProductStatus {
  product: {
    id: string;
    name: string;
    url: string;
    category: string;
  };
  latestCheck: ProductCheck | null;
  uptime24h: number;
  uptime7d: number;
  uptime30d: number;
  avgResponseTime: number;
  recentChecks: ProductCheck[];
  activeIncidents: {
    id: string;
    type: string;
    details: string | null;
    started_at: string;
  }[];
}

interface Incident {
  id: string;
  productId: string;
  productName: string;
  type: string;
  details: string | null;
  startedAt: string;
  resolvedAt: string | null;
  isActive: boolean;
  duration: number;
}

// âââ Helpers ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function statusColor(status: string | undefined) {
  if (status === "healthy") return "bg-green-500";
  if (status === "degraded") return "bg-yellow-500";
  return "bg-red-500";
}

function statusLabel(status: string | undefined) {
  if (status === "healthy") return "Healthy";
  if (status === "degraded") return "Degraded";
  if (status === "down") return "Down";
  return "Unknown";
}

function uptimeColor(pct: number) {
  if (pct >= 99.5) return "text-green-400";
  if (pct >= 95) return "text-yellow-400";
  return "text-red-400";
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`;
}

function incidentTypeLabel(type: string) {
  const labels: Record<string, string> = {
    downtime: "Downtime",
    ssl_expiry: "SSL Expiry",
    slow_response: "Slow Response",
    error_detected: "Error Detected",
  };
  return labels[type] ?? type;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// âââ Mini Response Time Chart âââââââââââââââââââââââââââââââââââââââââââââââ

function ResponseTimeChart({ checks }: { checks: ProductCheck[] }) {
  if (checks.length === 0) return <div className="text-xs text-neutral-500">No data</div>;

  const reversed = [...checks].reverse();
  const max = Math.max(...reversed.map((c) => c.response_time), 1);
  const barCount = Math.min(reversed.length, 48);
  const displayChecks = reversed.slice(-barCount);

  return (
    <div className="flex items-end gap-px h-8" title="Response time (last 24h)">
      {displayChecks.map((check, i) => {
        const height = Math.max((check.response_time / max) * 100, 4);
        const color =
          check.status === "down"
            ? "bg-red-500"
            : check.response_time > 3000
              ? "bg-yellow-500"
              : "bg-green-500/60";
        return (
          <div
            key={i}
            className={`${color} rounded-sm min-w-[2px] flex-1`}
            style={{ height: `${height}%` }}
            title={`${check.response_time}ms â ${new Date(check.checked_at).toLocaleTimeString()}`}
          />
        );
      })}
    </div>
  );
}

// âââ Product Card âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function ProductCard({ data }: { data: ProductStatus }) {
  const { product, latestCheck, uptime24h, uptime7d, uptime30d, avgResponseTime, recentChecks, activeIncidents } = data;
  const status = latestCheck?.status;

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 hover:border-neutral-700 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${statusColor(status)} ${status === "down" ? "pulse-dot" : ""}`} />
          <h3 className="font-semibold text-sm">{product.name}</h3>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          status === "healthy" ? "bg-green-500/10 text-green-400" :
          status === "degraded" ? "bg-yellow-500/10 text-yellow-400" :
          "bg-red-500/10 text-red-400"
        }`}>
          {statusLabel(status)}
        </span>
      </div>

      {/* URL */}
      <a
        href={product.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-neutral-500 hover:text-neutral-300 truncate block mb-3"
      >
        {product.url.replace("https://", "")}
      </a>

      {/* Response Time Chart */}
      <div className="mb-3">
        <ResponseTimeChart checks={recentChecks} />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-2 text-center mb-3">
        <div>
          <div className="text-[10px] text-neutral-500 uppercase tracking-wider">24h</div>
          <div className={`text-sm font-mono font-bold ${uptimeColor(uptime24h)}`}>{uptime24h}%</div>
        </div>
        <div>
          <div className="text-[10px] text-neutral-500 uppercase tracking-wider">7d</div>
          <div className={`text-sm font-mono font-bold ${uptimeColor(uptime7d)}`}>{uptime7d}%</div>
        </div>
        <div>
          <div className="text-[10px] text-neutral-500 uppercase tracking-wider">30d</div>
          <div className={`text-sm font-mono font-bold ${uptimeColor(uptime30d)}`}>{uptime30d}%</div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-neutral-500 pt-2 border-t border-neutral-800">
        <span>{avgResponseTime}ms avg</span>
        {latestCheck?.ssl_days_remaining !== null && latestCheck?.ssl_days_remaining !== undefined && (
          <span className={latestCheck.ssl_days_remaining < 30 ? "text-yellow-400" : ""}>
            SSL: {latestCheck.ssl_days_remaining}d
          </span>
        )}
        {latestCheck && <span>{timeAgo(latestCheck.checked_at)}</span>}
      </div>

      {/* Active Incidents */}
      {activeIncidents.length > 0 && (
        <div className="mt-2 pt-2 border-t border-red-500/20">
          {activeIncidents.map((inc) => (
            <div key={inc.id} className="text-xs text-red-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 pulse-dot" />
              {incidentTypeLabel(inc.type)}: {inc.details}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// âââ Incidents Table ââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function IncidentsTable({ incidents }: { incidents: Incident[] }) {
  if (incidents.length === 0) {
    return (
      <div className="text-center text-neutral-500 py-8">
        No incidents recorded yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-neutral-500 border-b border-neutral-800">
            <th className="pb-2 pr-4 font-medium">Status</th>
            <th className="pb-2 pr-4 font-medium">Product</th>
            <th className="pb-2 pr-4 font-medium">Type</th>
            <th className="pb-2 pr-4 font-medium">Details</th>
            <th className="pb-2 pr-4 font-medium">Started</th>
            <th className="pb-2 font-medium">Duration</th>
          </tr>
        </thead>
        <tbody>
          {incidents.map((inc) => (
            <tr key={inc.id} className="border-b border-neutral-800/50 hover:bg-neutral-800/30">
              <td className="py-2 pr-4">
                {inc.isActive ? (
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500 pulse-dot" />
                    <span className="text-red-400 text-xs">Active</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-green-400 text-xs">Resolved</span>
                  </span>
                )}
              </td>
              <td className="py-2 pr-4 font-medium">{inc.productName}</td>
              <td className="py-2 pr-4 text-neutral-400">{incidentTypeLabel(inc.type)}</td>
              <td className="py-2 pr-4 text-neutral-500 max-w-xs truncate">{inc.details}</td>
              <td className="py-2 pr-4 text-neutral-500">{timeAgo(inc.startedAt)}</td>
              <td className="py-2 text-neutral-500">{formatDuration(inc.duration)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// âââ Overview Bar âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function OverviewBar({ products }: { products: ProductStatus[] }) {
  const total = products.length;
  const healthy = products.filter((p) => p.latestCheck?.status === "healthy").length;
  const degraded = products.filter((p) => p.latestCheck?.status === "degraded").length;
  const down = products.filter((p) => p.latestCheck?.status === "down" || !p.latestCheck).length;
  const allHealthy = healthy === total;

  return (
    <div className={`rounded-lg p-4 border ${allHealthy ? "bg-green-500/5 border-green-500/20" : "bg-red-500/5 border-red-500/20"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${allHealthy ? "bg-green-500" : "bg-red-500 pulse-dot"}`} />
          <span className="font-semibold">
            {allHealthy ? "All Systems Operational" : `${down + degraded} Product${down + degraded > 1 ? "s" : ""} Need Attention`}
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-green-400">{healthy} healthy</span>
          {degraded > 0 && <span className="text-yellow-400">{degraded} degraded</span>}
          {down > 0 && <span className="text-red-400">{down} down</span>}
          <span className="text-neutral-500">/ {total} total</span>
        </div>
      </div>
    </div>
  );
}

// âââ Main Dashboard âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

export default function Dashboard() {
  const [products, setProducts] = useState<ProductStatus[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [healthRes, incidentsRes] = await Promise.all([
        fetch("/api/health"),
        fetch("/api/incidents"),
      ]);

      if (!healthRes.ok) throw new Error(`Health API: ${healthRes.status}`);
      if (!incidentsRes.ok) throw new Error(`Incidents API: ${incidentsRes.status}`);

      const healthData = await healthRes.json();
      const incidentsData = await incidentsRes.json();

      setProducts(healthData.products ?? []);
      setIncidents(incidentsData.incidents ?? []);
      setLastUpdated(healthData.updatedAt);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-neutral-700 border-t-white rounded-full animate-spin mx-auto mb-4" />
          <p className="text-neutral-500">Loading product health data...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Holdco Monitor</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Product health dashboard â checks every 15 minutes
          </p>
        </div>
        <div className="text-right">
          {lastUpdated && (
            <p className="text-xs text-neutral-500">
              Updated {timeAgo(lastUpdated)}
            </p>
          )}
          <button
            onClick={() => { setLoading(true); fetchData(); }}
            className="mt-1 text-xs text-neutral-400 hover:text-white px-3 py-1 border border-neutral-700 rounded hover:border-neutral-500 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          Failed to load data: {error}
        </div>
      )}

      {/* Overview */}
      <div className="mb-6">
        <OverviewBar products={products} />
      </div>

      {/* Product Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {products.map((p) => (
          <ProductCard key={p.product.id} data={p} />
        ))}
      </div>

      {/* Recent Incidents */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Recent Incidents</h2>
        <IncidentsTable incidents={incidents} />
      </div>
    </main>
  );
}
