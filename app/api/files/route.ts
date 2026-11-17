import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { resolveGeneratedImage } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const fileName = new URL(request.url).searchParams.get("file");
  if (!fileName) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  try {
    const filePath = resolveGeneratedImage(fileName);
    const file = await fs.readFile(filePath);
    return new NextResponse(file, {
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(file.byteLength),
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }
}
