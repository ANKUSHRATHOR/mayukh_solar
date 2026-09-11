/**
 * Access tokens for the company Google account.
 *
 * The business runs on a single Google account rather than a Workspace shared
 * drive, so there is no service-account JWT flow here: we hold one long-lived
 * refresh token as a function secret and trade it for short-lived access
 * tokens. The refresh token is only long-lived while the OAuth consent screen
 * is published — in "Testing" mode Google expires it after 7 days, which
 * presents as every document in the CRM going unreachable at once.
 */

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/**
 * Cached in module scope, so a warm isolate serving a burst of thumbnail
 * requests spends one round-trip on Google auth rather than one per file.
 * Refreshed a minute early to avoid racing the expiry.
 */
let cachedToken: { value: string; expiresAt: number } | null = null;

export class GoogleAuthError extends Error {}

export const getAccessToken = async (): Promise<string> => {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN");

  if (!clientId || !clientSecret || !refreshToken) {
    throw new GoogleAuthError(
      "Google Drive is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN.",
    );
  }

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    cachedToken = null;
    // `invalid_grant` is the one worth naming: it means the refresh token was
    // revoked or expired, and no amount of retrying will fix it.
    const detail = body?.error === "invalid_grant"
      ? "The Google refresh token has been revoked or expired. Re-authorise the company Google account."
      : body?.error_description || body?.error || `HTTP ${response.status}`;
    throw new GoogleAuthError(`Could not authenticate with Google Drive: ${detail}`);
  }

  const expiresInSeconds = typeof body.expires_in === "number" ? body.expires_in : 3600;
  cachedToken = {
    value: body.access_token,
    expiresAt: Date.now() + (expiresInSeconds - 60) * 1000,
  };

  return cachedToken.value;
};
