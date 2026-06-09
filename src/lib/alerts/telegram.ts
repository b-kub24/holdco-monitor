import type { Alert, HealthCheckResult, Product } from "@/lib/types";
import {
  getActiveIncident,
  openIncident,
  resolveIncident,
  getLatestCheck,
} from "@/lib/db/supabase";

// âââ Telegram Alert via Zapier Webhook ââââââââââââââââââââââââââââââââââââââ

const WEBHOOK_URL = process.env.ZAPIER_WEBHOOK_URL;

async function sendTelegramAlert(alert: Alert): Promise<void> {
  if (!WEBHOOK_URL) {
    console.warn("[Alert] No ZAPIER_WEBHOOK_URL configured â skipping alert");
    return;
  }

  const emoji = {
    down: "ð´",
    ssl_warning: "ð¡",
    slow: "ð ",
    recovered: "ð¢",
    error: "â ï¸",
  }[alert.type];

  const message = [
    `${emoji} **${alert.productName}**`,
    "",
    alert.message,
    alert.details ? `\n${alert.details}` : "",
    "",
    `ð ${alert.productUrl}`,
    `â° ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        product: alert.productName,
        type: alert.type,
        url: alert.productUrl,
      }),
    });

    if (!response.ok) {
      console.error(
        `[Alert] Zapier webhook failed: ${response.status} ${response.statusText}`
      );
    }
  } catch (err) {
    console.error("[Alert] Failed to send webhook:", err);
  }
}

// âââ Alert Logic ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

/**
 * Processes a health check result and sends appropriate alerts.
 * Handles: down detection, recovery, SSL warnings, slow response.
 */
export async function processAlerts(
  product: Product,
  result: HealthCheckResult
): Promise<void> {
  // ââ Product is DOWN âââââââââââââââââââââââââââââââââââââââââââââââââ
  if (result.status === "down") {
    const existingIncident = await getActiveIncident(product.id, "downtime");

    if (!existingIncident) {
      // New outage â open incident + alert
      await openIncident(
        product.id,
        "downtime",
        `HTTP ${result.httpStatus ?? "N/A"} â ${result.errorStrings.join(", ") || "No response"}`
      );

      await sendTelegramAlert({
        productName: product.name,
        productUrl: product.url,
        type: "down",
        message: `Product is DOWN`,
        details: [
          `Status: HTTP ${result.httpStatus ?? "Connection failed"}`,
          result.errorStrings.length > 0
            ? `Errors: ${result.errorStrings.join(", ")}`
            : null,
          `Response time: ${result.responseTime}ms`,
        ]
          .filter(Boolean)
          .join("\n"),
      });
    }
    // If incident already exists, no repeat alert (avoids spam)
    return;
  }

  // ââ Product RECOVERED âââââââââââââââââââââââââââââââââââââââââââââ
  const activeDowntime = await getActiveIncident(product.id, "downtime");
  if (activeDowntime) {
    await resolveIncident(activeDowntime.id);

    const downDuration = Math.round(
      (Date.now() - new Date(activeDowntime.started_at).getTime()) / 60000
    );

    await sendTelegramAlert({
      productName: product.name,
      productUrl: product.url,
      type: "recovered",
      message: `Product RECOVERED`,
      details: `Was down for ~${downDuration} minutes`,
    });
  }

  // ââ SSL expiring soon âââââââââââââââââââââââââââââââââââââââââââââ
  if (
    result.sslDaysRemaining !== null &&
    result.sslDaysRemaining < 30 &&
    result.sslDaysRemaining > 0
  ) {
    const existingSslIncident = await getActiveIncident(
      product.id,
      "ssl_expiry"
    );
    if (!existingSslIncident) {
      await openIncident(
        product.id,
        "ssl_expiry",
        `SSL certificate expires in ${result.sslDaysRemaining} days`
      );

      await sendTelegramAlert({
        productName: product.name,
        productUrl: product.url,
        type: "ssl_warning",
        message: `SSL certificate expiring soon`,
        details: `Expires in ${result.sslDaysRemaining} days`,
      });
    }
  } else if (result.sslDaysRemaining !== null && result.sslDaysRemaining >= 30) {
    // SSL renewed â resolve any open SSL incident
    const activeSslIncident = await getActiveIncident(
      product.id,
      "ssl_expiry"
    );
    if (activeSslIncident) {
      await resolveIncident(activeSslIncident.id);
    }
  }

  // ââ Slow response (consistently > 3s) âââââââââââââââââââââââââââââ
  if (result.responseTime > 3000) {
    // Check if previous check was also slow
    const lastCheck = await getLatestCheck(product.id);
    const wasPreviouslySlow =
      lastCheck && lastCheck.response_time > 3000;

    if (wasPreviouslySlow) {
      const existingSlowIncident = await getActiveIncident(
        product.id,
        "slow_response"
      );
      if (!existingSlowIncident) {
        await openIncident(
          product.id,
          "slow_response",
          `Response time consistently above 3s (latest: ${result.responseTime}ms)`
        );

        await sendTelegramAlert({
          productName: product.name,
          productUrl: product.url,
          type: "slow",
          message: `Consistently slow response`,
          details: `Last two checks: ${lastCheck.response_time}ms, ${result.responseTime}ms (threshold: 3000ms)`,
        });
      }
    }
  } else {
    // Response time normal â resolve any slow incident
    const activeSlowIncident = await getActiveIncident(
      product.id,
      "slow_response"
    );
    if (activeSlowIncident) {
      await resolveIncident(activeSlowIncident.id);
    }
  }

  // ââ Error strings detected ââââââââââââââââââââââââââââââââââââââââ
  if (result.errorStrings.length > 0 && result.status !== "down") {
    const existingErrorIncident = await getActiveIncident(
      product.id,
      "error_detected"
    );
    if (!existingErrorIncident) {
      await openIncident(
        product.id,
        "error_detected",
        result.errorStrings.join(", ")
      );

      await sendTelegramAlert({
        productName: product.name,
        productUrl: product.url,
        type: "error",
        message: `Error strings detected in response`,
        details: result.errorStrings.join("\n"),
      });
    }
  } else if (result.errorStrings.length === 0) {
    const activeErrorIncident = await getActiveIncident(
      product.id,
      "error_detected"
    );
    if (activeErrorIncident) {
      await resolveIncident(activeErrorIncident.id);
    }
  }
}
