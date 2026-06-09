export interface Product {
  id: string;
  name: string;
  url: string;
  checkInterval: number;
  expectedStatus: number;
  category: "saas" | "tool" | "agent" | "landing";
}

export type HealthStatus = "healthy" | "degraded" | "down";

export interface HealthCheckResult {
  productId: string;
  status: HealthStatus;
  httpStatus: number | null;
  responseTime: number;
  sslDaysRemaining: number | null;
  sslValid: boolean;
  errorStrings: string[];
  checkedAt: string;
}

export interface SSLInfo {
  valid: boolean;
  daysRemaining: number | null;
  issuer: string | null;
  expiresAt: string | null;
}

export interface DBProduct {
  id: string;
  name: string;
  url: string;
  check_interval: number;
  category: string;
  created_at: string;
}

export interface DBHealthCheck {
  id: string;
  product_id: string;
  status: HealthStatus;
  http_status: number | null;
  response_time: number;
  ssl_days_remaining: number | null;
  ssl_valid: boolean;
  error_messages: string[] | null;
  checked_at: string;
}

export interface DBIncident {
  id: string;
  product_id: string;
  type: "downtime" | "ssl_expiry" | "slow_response" | "error_detected";
  started_at: string;
  resolved_at: string | null;
  details: string | null;
}

export interface Alert {
  productName: string;
  productUrl: string;
  type: "down" | "ssl_warning" | "slow" | "recovered" | "error";
  message: string;
  details?: string;
}

export interface ProductStatus {
  product: DBProduct;
  latestCheck: DBHealthCheck | null;
  uptime24h: number;
  uptime7d: number;
  uptime30d: number;
  avgResponseTime: number;
  recentChecks: DBHealthCheck[];
  activeIncidents: DBIncident[];
}
