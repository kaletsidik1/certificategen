import { createHash, timingSafeEqual } from "node:crypto";

function constantTimeEqual(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left, "utf8").digest();
  const rightHash = createHash("sha256").update(right, "utf8").digest();
  return timingSafeEqual(leftHash, rightHash);
}

export function isAdminAuthorized(
  authorizationHeader: string | null,
  expectedUsername: string,
  expectedPassword: string
): boolean {
  if (!authorizationHeader || authorizationHeader.length > 8192) return false;

  const match = /^Basic\s+([A-Za-z0-9+/]+={0,2})$/i.exec(authorizationHeader);
  if (!match) return false;

  let decoded: string;
  try {
    decoded = Buffer.from(match[1], "base64").toString("utf8");
  } catch {
    return false;
  }

  const separator = decoded.indexOf(":");
  if (separator < 0) return false;

  const username = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);
  const usernameMatches = constantTimeEqual(username, expectedUsername);
  const passwordMatches = constantTimeEqual(password, expectedPassword);
  return usernameMatches && passwordMatches;
}

export function isSameOrigin(origin: string | null, expectedOrigin: string): boolean {
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(expectedOrigin).origin;
  } catch {
    return false;
  }
}
