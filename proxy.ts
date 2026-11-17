import { NextResponse, type NextRequest } from "next/server";
import { isAdminAuthorized, isSameOrigin } from "@/lib/admin-auth";
import { getAppUrl } from "@/lib/issuer";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function proxy(request: NextRequest) {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (
    !username || username.length > 128 || /[:\r\n]/.test(username) ||
    !password || password.length < 16 || password.length > 1024 || /[\r\n]/.test(password)
  ) {
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    return new NextResponse("Admin authentication is not configured.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (!isAdminAuthorized(request.headers.get("authorization"), username, password)) {
    const isApiRequest = request.nextUrl.pathname.startsWith("/api/");
    const headers = {
      "WWW-Authenticate": 'Basic realm="Certificate Admin", charset="UTF-8"',
      "Cache-Control": "no-store",
    };
    return isApiRequest
      ? NextResponse.json({ error: "Authentication required" }, { status: 401, headers })
      : new NextResponse("Authentication required.", { status: 401, headers });
  }

  if (!SAFE_METHODS.has(request.method)) {
    let canonicalOrigin: string;
    try {
      canonicalOrigin = process.env.NODE_ENV === "development"
        ? request.nextUrl.origin
        : getAppUrl();
    } catch {
      return new NextResponse("Application URL is not configured.", {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (!isSameOrigin(request.headers.get("origin"), canonicalOrigin)) {
      return new NextResponse("Cross-origin request rejected.", {
        status: 403,
        headers: { "Cache-Control": "no-store" },
      });
    }
  }

  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export const config = {
  matcher: ["/", "/api/:path*"],
};
