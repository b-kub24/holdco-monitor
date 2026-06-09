import * as tls from "tls";
import type {
  Product,
  HealthCheckResult,
  HealthStatus,
  SSLInfo,
} from "@/lib/types";

// âââ Error Strings to Scan For ââââââââââââââââââââââââââââââââââââââââââââââ

const ERROR_PATTERNS = [
  "Internal Server Error",
  "500 Internal",
  "502 Bad Gateway",
  "503 Service Unavailable",
  "504 Gateway Timeout",
  "Application error",
  "NEXT_NOT_FOUND",
  "This page could not be found",
  "Runtime Error",
  "Unhandled Runtime Error",
  "FUNCTION_INVOCATION_TIMEOUT",
  "EDGE_FUNCTION_INVOCATION_TIMEOUT",
  "SERVERLESS_FUNCTION_TIMEOUT",
  "Build Error",
  "Deploy Error",
];

// âââ SSL Certificate Check ââââââââââââââââââââââââââââââââââââââââââââââââââ

function checkSSL(hostname: string): Promise<SSLInfo> {
  return new Promise((resolve) => {
    try {
      const socket = tls.connect(
        443,
        hostname,
        { servername: hostname, timeout: 10000 },
        () => {
          const cert = socket.getPeerCertificate();
          socket.destroy();

          if (!cert || !cert.valid_to) {
            resolve({
              valid: false,
              daysRemaining: null,
              issuer: null,
              expiresAt: null,
            });
            return;
          }

          const expiresAt = new Date(cert.valid_to);
          const now = new Date();
          const daysRemaining = Math.floor(
            (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );

          resolve({
            valid: daysRemaining > 0,
            daysRemaining,
            issuer: cert.issuer?.O ?? null,
            expiresAt: expiresAt.toISOString(),
          });
        }
      );

      socket.on("error", () => {
        socket.destroy();
        resolve({
          valid: false,
          daysRemaining: null,
          issuer: null,
          expiresAt: null,
        });
      });

      socket.on("timeout", () => {
        socket.destroy();
        resolve({
          valid: false,
          daysRemaining: null,
          issuer: null,
          expiresAt: null,
        });
      });
    } catch {
      resolve({
        valid: false,
        daysRemaining: null,
        issuer: null,
        expiresAt: null,
      });
    }
  });
}

// âââ HTTP Health Check ââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function determineStatus(
  httpStatus: number | null,
  responseTime: number,
  sslDaysRemaining: number | null,
  errorStrings: string[]
): HealthStatus {
  // Down: non-200 status or connection failed
  if (httpStatus === null || httpStatus >= 500) return "down";
  if (httpStatus >= 400) return "down";

  // Degraded: slow response, SSL warning, or error strings found
  if (responseTime > 3000) return "degraded";
  if (sslDaysRemaining !== null && sslDaysRemaining < 30) return "degraded";
  if (errorStrings.length > 0) return "degraded";

  return "healthy";
}

export async function checkProduct(
  product: Product
): Promise<HealthCheckResult> {
  const startTime = Date.now();
  let httpStatus: number | null = null;
  let responseBody = "";
  let responseTime = 0;
  const errorStrings: string[] = [];

  // ââ HTTP request ââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(product.url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "HoldcoMonitor/1.0",
        Accept: "text/html,application/json",
      },
      redirect: "follow",
    });

    clearTimeout(timeout);
    responseTime = Date.now() - startTime;
    httpStatus = response.status;

    // Read first 50KB of body to scan for errors
    const reader = response.body?.getReader();
    if (reader) {
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      const maxBytes = 50 * 1024;

      while (totalBytes < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalBytes += value.length;
      }
      reader.cancel();

      responseBody = new TextDecoder().decode(
        Buffer.concat(chunks).slice(0, maxBytes)
      );
    }
  } catch (err) {
    responseTime = Date.now() - startTime;
    const message = err instanceof Error ? err.message : String(err);
    errorStrings.push(`Connection failed: ${message}`);
  }

  // ââ Scan for error strings ââââââââââââââââââââââââââââââââââââââââââââ
  for (const pattern of ERROR_PATTERNS) {
    if (responseBody.includes(pattern)) {
      errorStrings.push(pattern);
    }
  }

  // ââ SSL check âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  let sslInfo: SSLInfo = {
    valid: true,
    daysRemaining: null,
    issuer: null,
    expiresAt: null,
  };
  try {
    const hostname = new URL(product.url).hostname;
    sslInfo = await checkSSL(hostname);
  } catch {
    // SSL check is best-effort
  }

  // ââ Determine status ââââââââââââââââââââââââââââââââââââââââââââââââââ
  const status = determineStatus(
    httpStatus,
    responseTime,
    sslInfo.daysRemaining,
    errorStrings
  );

  return {
    productId: product.id,
    status,
    httpStatus,
    responseTime,
    sslDaysRemaining: sslInfo.daysRemaining,
    sslValid: sslInfo.valid,
    errorStrings,
    checkedAt: new Date().toISOString(),
  };
}

/** Run health checks for all products in parallel */
export async function checkAllProducts(
  products: Product[]
): Promise<HealthCheckResult[]> {
  const results = await Promise.allSettled(
    products.map((p) => checkProduct(p))
  );

  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;

    // If the check itself threw, return a "down" result
    return {
      productId: products[i].id,
      status: "down" as HealthStatus,
      httpStatus: null,
      responseTime: 0,
      sslDaysRemaining: null,
      sslValid: false,
      errorStrings: [`Check failed: ${r.reason}`],
      checkedAt: new Date().toISOString(),
    };
  });
}
