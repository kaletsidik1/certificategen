import { NextResponse } from "next/server";
import { getAppUrl, getIssuerConfig } from "@/lib/issuer";

export async function GET() {
  try {
    const { name, websiteUrl, linkedinUrl, supportEmail, defaultEmailSubject, defaultEmailMessage } =
      getIssuerConfig();
    const appUrl = getAppUrl();
    return NextResponse.json(
      { name, websiteUrl, linkedinUrl, supportEmail, defaultEmailSubject, defaultEmailMessage, appUrl },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch {
    return NextResponse.json({ error: "Issuer configuration is invalid" }, { status: 500 });
  }
}
