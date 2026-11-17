import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getStorageDirectory, resolveTemplateFile } from "@/lib/storage";

export const runtime = "nodejs";

const MAX_TEMPLATE_BYTES = 10 * 1024 * 1024;
const MAX_TEMPLATE_PIXELS = 50_000_000;

function readNumber(form: FormData, key: string, min: number, max: number): number | null {
  const raw = form.get(key);
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= min && value <= max ? value : null;
}

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_TEMPLATE_BYTES + 64 * 1024) {
      return NextResponse.json({ error: "Template file is too large" }, { status: 413 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "A PNG template file is required" }, { status: 400 });
    }
    if (file.size < 8 || file.size > MAX_TEMPLATE_BYTES) {
      return NextResponse.json({ error: "Template must be at most 10 MB" }, { status: 413 });
    }

    const nameX = readNumber(form, "nameX", 0, 50_000);
    const nameY = readNumber(form, "nameY", 0, 50_000);
    const qrX = readNumber(form, "qrX", 0, 50_000);
    const qrY = readNumber(form, "qrY", 0, 50_000);
    const qrSize = readNumber(form, "qrSize", 64, 1024);
    const fontSize = readNumber(form, "fontSize", 8, 300);
    const fontFamilyRaw = form.get("fontFamily");
    const fontFamily = typeof fontFamilyRaw === "string" ? fontFamilyRaw.trim() : "Inter";
    const fontWeightRaw = form.get("fontWeight");
    const fontWeight = typeof fontWeightRaw === "string" ? fontWeightRaw : "600";
    const fontColorRaw = form.get("fontColor");
    const fontColor = typeof fontColorRaw === "string" ? fontColorRaw : "#000000";

    if ([nameX, nameY, qrX, qrY, qrSize, fontSize].some((value) => value === null)) {
      return NextResponse.json({ error: "Template positioning values are invalid" }, { status: 400 });
    }
    if (!/^[a-zA-Z0-9 ,_-]{1,80}$/.test(fontFamily)) {
      return NextResponse.json({ error: "Font family contains unsupported characters" }, { status: 400 });
    }
    if (!/^(400|500|600|700|800|900)$/.test(fontWeight)) {
      return NextResponse.json({ error: "Font weight is invalid" }, { status: 400 });
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(fontColor)) {
      return NextResponse.json({ error: "Font color must be a six-digit hexadecimal color" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const metadata = await sharp(buffer, { limitInputPixels: MAX_TEMPLATE_PIXELS }).metadata();
    if (metadata.format !== "png" || !metadata.width || !metadata.height) {
      return NextResponse.json({ error: "The uploaded file is not a valid PNG image" }, { status: 400 });
    }
    if (metadata.width * metadata.height > MAX_TEMPLATE_PIXELS) {
      return NextResponse.json({ error: "Template dimensions are too large" }, { status: 400 });
    }
    if (
      nameX! > metadata.width || nameY! > metadata.height ||
      qrX! + qrSize! > metadata.width || qrY! + qrSize! > metadata.height
    ) {
      return NextResponse.json({ error: "Template positioning must fit within the image" }, { status: 400 });
    }

    const templateId = crypto.randomUUID();
    const fileName = `template-${templateId}.png`;
    const templatePath = resolveTemplateFile(fileName);
    const metadataPath = path.join(getStorageDirectory("templates"), `${templateId}.json`);
    const template = {
      id: templateId,
      fileName,
      width: metadata.width,
      height: metadata.height,
      nameX,
      nameY,
      qrX,
      qrY,
      qrSize,
      fontSize,
      fontFamily,
      fontWeight,
      fontColor,
    };

    await fs.mkdir(getStorageDirectory("templates"), { recursive: true });
    await fs.writeFile(templatePath, buffer, { flag: "wx" });
    try {
      await fs.writeFile(metadataPath, JSON.stringify(template), { flag: "wx" });
    } catch (error) {
      await fs.rm(templatePath, { force: true });
      throw error;
    }

    return NextResponse.json({ template }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Template upload failed" }, { status: 500 });
  }
}
