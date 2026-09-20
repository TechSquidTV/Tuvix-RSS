import { APIError } from "better-auth/api";
import { sql } from "drizzle-orm";
import type { Database } from "@api/db/client";
import { authRateLimits } from "@api/db/schema";
import type { GlobalSettings } from "@api/services/global-settings";
import { extractHeaders, getClientIp } from "./security";

/** Persist attempts across workers/restarts; a single upsert prevents races. */
export async function enforceAuthRateLimit(
  db: Database,
  headers: Headers | undefined,
  settings: GlobalSettings
): Promise<void> {
  const ip = getClientIp(extractHeaders(headers)) ?? "unidentified";
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(ip)
  );
  const key = Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  const now = Date.now();
  const window = settings.loginAttemptWindowMinutes * 60_000;
  const reset = sql`((${authRateLimits.lockedUntil} > 0 AND ${authRateLimits.lockedUntil} <= ${now}) OR (${authRateLimits.lockedUntil} = 0 AND ${authRateLimits.windowStartedAt} <= ${now - window}))`;
  const [result] = await db
    .insert(authRateLimits)
    .values({ key, attempts: 1, windowStartedAt: now, lockedUntil: 0 })
    .onConflictDoUpdate({
      target: authRateLimits.key,
      set: {
        attempts: sql`CASE WHEN ${reset} THEN 1 WHEN ${authRateLimits.lockedUntil} > ${now} THEN ${authRateLimits.attempts} ELSE ${authRateLimits.attempts} + 1 END`,
        windowStartedAt: sql`CASE WHEN ${reset} THEN ${now} ELSE ${authRateLimits.windowStartedAt} END`,
        lockedUntil: sql`CASE WHEN ${reset} THEN 0 WHEN ${authRateLimits.lockedUntil} > ${now} THEN ${authRateLimits.lockedUntil} WHEN ${authRateLimits.attempts} >= ${settings.maxLoginAttempts} THEN ${now + settings.lockoutDurationMinutes * 60_000} ELSE 0 END`,
      },
    })
    .returning();
  if (!result || result.lockedUntil > now) {
    throw new APIError("TOO_MANY_REQUESTS", {
      message: "Too many authentication attempts. Please try again later.",
    });
  }
}
