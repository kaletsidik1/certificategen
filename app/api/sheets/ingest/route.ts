import { NextResponse } from "next/server";
import type { IngestRow } from "@/lib/roster";
import { parse as parseCsvSync } from "csv-parse/sync";

const MAX_SHEET_URL_LENGTH = 2048;
const MAX_CSV_BYTES = 5 * 1024 * 1024;
const MAX_ROSTER_ROWS = 1000;

function parseSpreadsheetUrl(value: string): { spreadsheetId: string; gid: string } | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "docs.google.com") return null;
    const match = /^\/spreadsheets\/d\/([a-zA-Z0-9_-]{10,200})(?:\/|$)/.exec(url.pathname);
    if (!match) return null;
    const gid = url.searchParams.get("gid") ?? url.hash.match(/(?:^|[&#])gid=(\d+)/)?.[1] ?? "0";
    if (!/^\d{1,20}$/.test(gid)) return null;
    return { spreadsheetId: match[1], gid };
  } catch {
    return null;
  }
}

async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > maxBytes) throw new Error("Spreadsheet export exceeds the size limit");
  if (!response.body) throw new Error("Spreadsheet export is empty");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Spreadsheet export exceeds the size limit");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseCsv(text: string): string[][] {
  return parseCsvSync(text, {
    bom: true,
    relax_column_count: true,
    skip_empty_lines: true,
    max_record_size: 10_000,
    to: MAX_ROSTER_ROWS + 2,
  });
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export async function POST(req: Request) {
  try {
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > 8 * 1024) {
      return NextResponse.json({ error: "Request is too large" }, { status: 413 });
    }
    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const sheetUrl = (body as Record<string, unknown>).sheetUrl;
    if (!sheetUrl || typeof sheetUrl !== "string") {
      return NextResponse.json({ error: "sheetUrl required" }, { status: 400 });
    }
    if (sheetUrl.length > MAX_SHEET_URL_LENGTH) {
      return NextResponse.json({ error: "Google Sheets URL is too long" }, { status: 400 });
    }
    const parsedUrl = parseSpreadsheetUrl(sheetUrl);
    if (!parsedUrl) {
      return NextResponse.json(
        { error: "Invalid Google Sheets URL" },
        { status: 400 }
      );
    }

    const exportUrl = `https://docs.google.com/spreadsheets/d/${parsedUrl.spreadsheetId}/export?format=csv&gid=${parsedUrl.gid}`;
    const resp = await fetch(exportUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const contentType = resp.headers.get("content-type");

    if (!resp.ok || contentType?.includes("text/html")) {
      return NextResponse.json(
        {
          error: "The spreadsheet is private or inaccessible.",
          details: "Please ensure the Google Sheet is shared as 'Anyone with the link can view'."
        },
        { status: 403 }
      );
    }
    const text = await readLimitedText(resp, MAX_CSV_BYTES);
    if (text.trimStart().startsWith("<!DOCTYPE html") || text.trimStart().startsWith("<html")) {
      return NextResponse.json(
        { error: "The spreadsheet is private or inaccessible.", details: "Share the Google Sheet as anyone with the link can view." },
        { status: 403 }
      );
    }

    let values: string[][];
    try {
      values = parseCsv(text);
    } catch {
      return NextResponse.json({ error: "Spreadsheet CSV could not be parsed" }, { status: 400 });
    }
    if (values.length === 0) {
      return NextResponse.json({ error: "No rows found" }, { status: 400 });
    }
    if (values.length > MAX_ROSTER_ROWS + 1) {
      return NextResponse.json({ error: `A roster may contain at most ${MAX_ROSTER_ROWS} recipients` }, { status: 413 });
    }

    const header = values[0].map((h) => h.trim().replace(/^\uFEFF/, "").toLowerCase());
    const findIdx = (aliases: string[]) =>
      header.findIndex((h) => aliases.some((alias) => h === alias.toLowerCase()));
    const nameIdx = findIdx(["Full Name", "Name"]);
    const firstIdx = findIdx(["First Name", "First"]);
    const lastIdx = findIdx(["Last Name", "Last", "Surname"]);
    const emailIdx = findIdx(["Email Address", "Email"]);
    if (nameIdx < 0 && (firstIdx < 0 || lastIdx < 0)) {
      return NextResponse.json(
        { error: "Missing 'Full Name' or 'First Name'+'Last Name' columns" },
        { status: 400 }
      );
    }

    const rows: IngestRow[] = [];
    for (const [index, row] of values.slice(1).entries()) {
        const fullName =
          nameIdx >= 0
            ? normalizeName(row[nameIdx] ?? "")
            : normalizeName(`${row[firstIdx] ?? ""} ${row[lastIdx] ?? ""}`);
        const emailRaw = emailIdx >= 0 ? row[emailIdx] ?? "" : "";
        const email = emailRaw.trim() || undefined;
        if (!fullName) continue;
        if (fullName.length > 200 || /[\u0000-\u001f\u007f]/.test(fullName)) {
          return NextResponse.json({ error: `Invalid name on spreadsheet row ${index + 2}` }, { status: 400 });
        }
        if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
          return NextResponse.json({ error: `Invalid email address on spreadsheet row ${index + 2}` }, { status: 400 });
        }
        rows.push({ fullName, email });
        if (rows.length > MAX_ROSTER_ROWS) {
          return NextResponse.json({ error: `A roster may contain at most ${MAX_ROSTER_ROWS} recipients` }, { status: 413 });
        }
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: "No valid rows" }, { status: 400 });
    }

    const batchId = crypto.randomUUID();

    return NextResponse.json({
      batchId,
      total: rows.length,
      rows,
      preview: rows.slice(0, 10),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return NextResponse.json({ error: "Google Sheets request timed out" }, { status: 504 });
    }
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
