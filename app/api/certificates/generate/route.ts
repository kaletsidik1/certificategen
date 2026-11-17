import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { getAppUrl, getIssuerConfig } from "@/lib/issuer";
import { getStorageDirectory, resolveStoredFile, resolveTemplateFile } from "@/lib/storage";
import QRCode from "qrcode";
import sharp from "sharp";

export const runtime = "nodejs";

type RosterRow = { fullName: string; email?: string };
type TemplateMetadata = {
  fileName?: string;
  templateUrl?: string;
  width?: number;
  height?: number;
  nameX: number;
  nameY: number;
  qrX: number;
  qrY: number;
  qrSize?: number;
  fontSize: number;
  fontFamily?: string;
  fontWeight?: string;
  fontColor?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isValidEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function createCertificateNumber(prefix: string): string {
  const year = new Date().getUTCFullYear();
  const random = randomBytes(6).toString("hex").toUpperCase();
  return `${prefix}-${year}-${random}`;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character]!);
}

function validateTemplate(template: unknown): template is TemplateMetadata {
  if (!isRecord(template)) return false;
  const numbers = [template.nameX, template.nameY, template.qrX, template.qrY, template.fontSize];
  if (!numbers.every((value) => typeof value === "number" && Number.isFinite(value))) return false;
  if (
    template.qrSize !== undefined &&
    (typeof template.qrSize !== "number" || !Number.isFinite(template.qrSize))
  ) return false;
  if (template.fileName !== undefined && typeof template.fileName !== "string") return false;
  if (template.templateUrl !== undefined && typeof template.templateUrl !== "string") return false;
  if (template.fontFamily !== undefined && typeof template.fontFamily !== "string") return false;
  if (template.fontWeight !== undefined && typeof template.fontWeight !== "string") return false;
  if (template.fontColor !== undefined && typeof template.fontColor !== "string") return false;
  return true;
}

function existingCertificateResult(certificate: {
  id: string;
  fullName: string;
  certificateNumber: string;
  imagePath: string | null;
}) {
  const imageName = certificate.imagePath ? path.basename(certificate.imagePath) : "";
  return {
    id: certificate.id,
    status: "created" as const,
    fullName: certificate.fullName,
    certificateNumber: certificate.certificateNumber,
    imageUrl: `/api/files?file=${encodeURIComponent(imageName)}`,
  };
}

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "Generation request is too large" }, { status: 413 });
    }

    const body: unknown = await request.json();
    if (!isRecord(body)) {
      return NextResponse.json({ error: "Invalid generation request" }, { status: 400 });
    }
    const { batchId, templateId, rows, startIndex = 0 } = body;
    const rawProgramName = body.programName;
    const programName = typeof rawProgramName === "string" ? rawProgramName.trim() : null;

    if (!isUuid(batchId) || !isUuid(templateId)) {
      return NextResponse.json({ error: "Valid batchId and templateId are required" }, { status: 400 });
    }
    if (!Array.isArray(rows) || rows.length === 0 || rows.length > 50) {
      return NextResponse.json({ error: "Provide between 1 and 50 roster rows per request" }, { status: 400 });
    }
    if (!Number.isSafeInteger(startIndex) || (startIndex as number) < 0 || (startIndex as number) + rows.length > 1000) {
      return NextResponse.json({ error: "Roster row range is invalid" }, { status: 400 });
    }
    if (programName && (programName.length > 200 || /[\u0000-\u001f\u007f]/.test(programName))) {
      return NextResponse.json({ error: "Program name must be at most 200 characters" }, { status: 400 });
    }

    const rosterRows: RosterRow[] = [];
    for (const row of rows) {
      if (!isRecord(row) || typeof row.fullName !== "string") {
        return NextResponse.json({ error: "Each roster row must include a full name" }, { status: 400 });
      }
      const fullName = row.fullName.trim().replace(/\s+/g, " ");
      if (!fullName || fullName.length > 200 || /[\u0000-\u001f\u007f]/.test(fullName)) {
        return NextResponse.json({ error: "Roster contains an invalid name" }, { status: 400 });
      }
      let email: string | undefined;
      if (row.email !== undefined && row.email !== null && row.email !== "") {
        if (typeof row.email !== "string" || !isValidEmail(row.email.trim())) {
          return NextResponse.json({ error: "Roster contains an invalid email address" }, { status: 400 });
        }
        email = row.email.trim();
      }
      rosterRows.push({ fullName, email });
    }

    const templateMetadataPath = path.join(
      getStorageDirectory("templates"),
      `${templateId}.json`
    );
    let template: TemplateMetadata;
    try {
      const templateJson: unknown = JSON.parse(await fs.readFile(templateMetadataPath, "utf8"));
      if (!validateTemplate(templateJson)) throw new Error("Invalid metadata");
      template = templateJson;
    } catch {
      return NextResponse.json({ error: "Template not found or invalid" }, { status: 404 });
    }

    let templateFileName = template.fileName;
    if (!templateFileName && template.templateUrl) {
      templateFileName = path.basename(template.templateUrl);
    }
    if (!templateFileName) {
      return NextResponse.json({ error: "Template file is missing" }, { status: 404 });
    }

    let templateBuffer: Buffer;
    try {
      const templatePath = resolveTemplateFile(templateFileName);
      templateBuffer = await fs.readFile(templatePath);
    } catch {
      return NextResponse.json({ error: "Template file is missing" }, { status: 404 });
    }

    const metadata = await sharp(templateBuffer, { limitInputPixels: 50_000_000 }).metadata();
    if (metadata.format !== "png" || !metadata.width || !metadata.height || metadata.width * metadata.height > 50_000_000) {
      return NextResponse.json({ error: "Template image is invalid" }, { status: 400 });
    }

    const baseWidth = metadata.width;
    const baseHeight = metadata.height;
    const qrSize = Math.round(Math.max(32, Math.min(1024, template.qrSize ?? Math.floor(baseWidth * 0.15))));
    const qrLeft = Math.max(0, Math.min(Math.round(template.qrX), baseWidth - qrSize));
    const qrTop = Math.max(0, Math.min(Math.round(template.qrY), baseHeight - qrSize));
    const nameLeft = Math.max(0, Math.min(Math.round(template.nameX), baseWidth));
    const nameTop = Math.max(0, Math.min(Math.round(template.nameY), baseHeight));
    const fontSize = Math.round(Math.max(8, Math.min(300, template.fontSize)));
    const fontFamily = template.fontFamily && /^[a-zA-Z0-9 ,_-]{1,80}$/.test(template.fontFamily)
      ? template.fontFamily
      : "Inter";
    const fontWeight = template.fontWeight && /^(400|500|600|700|800|900)$/.test(template.fontWeight)
      ? template.fontWeight
      : "600";
    const fontColor = template.fontColor && /^#[0-9a-fA-F]{6}$/.test(template.fontColor)
      ? template.fontColor
      : "#000000";

    const appUrl = getAppUrl();
    const issuer = getIssuerConfig();
    const imagesDirectory = getStorageDirectory("images");
    await fs.mkdir(imagesDirectory, { recursive: true });
    const results: Array<Record<string, string>> = [];

    for (const [offset, row] of rosterRows.entries()) {
      const rowIndex = (startIndex as number) + offset;
      try {
        const existing = await prisma.certificate.findUnique({
          where: { batchId_rowIndex: { batchId, rowIndex } },
        });
        if (existing) {
          results.push(existingCertificateResult(existing));
          continue;
        }

        let certificateNumber = "";
        for (let attempt = 0; attempt < 3; attempt++) {
          const candidate = createCertificateNumber(issuer.certificateNumberPrefix);
          const conflict = await prisma.certificate.findUnique({ where: { certificateNumber: candidate } });
          if (!conflict) {
            certificateNumber = candidate;
            break;
          }
        }
        if (!certificateNumber) throw new Error("Unable to allocate certificate number");

        const verifyUrl = `${appUrl}/verify/${encodeURIComponent(certificateNumber)}`;
        const qrPng = await QRCode.toBuffer(verifyUrl, { width: qrSize });
        const upperName = row.fullName.toLocaleUpperCase();
        const baselineDy = Math.round(fontSize * 0.12);
        const svg = Buffer.from(
          `<svg width="${baseWidth}" height="${baseHeight}" xmlns="http://www.w3.org/2000/svg"><style>.name{font-family:'${fontFamily}';font-size:${fontSize}px;font-weight:${fontWeight};fill:${fontColor};text-anchor:middle;dominant-baseline:central}</style><text x="${nameLeft}" y="${nameTop}" dy="${baselineDy}" class="name">${escapeXml(upperName)}</text></svg>`
        );
        const imageBuffer = await sharp(templateBuffer, { limitInputPixels: 50_000_000 })
          .composite([
            { input: svg, left: 0, top: 0 },
            { input: qrPng, left: qrLeft, top: qrTop },
          ])
          .png()
          .toBuffer();

        const fileName = `${certificateNumber}.png`;
        const absoluteImagePath = resolveStoredFile("images", path.join("images", fileName));
        await fs.writeFile(absoluteImagePath, imageBuffer, { flag: "wx" });

        try {
          const created = await prisma.certificate.create({
            data: {
              fullName: upperName,
              email: row.email ?? null,
              certificateNumber,
              qrData: certificateNumber,
              imagePath: path.posix.join("images", fileName),
              batchId,
              rowIndex,
              programName,
            },
          });
          results.push({
            id: created.id,
            status: "created",
            certificateNumber,
            fullName: upperName,
            imageUrl: `/api/files?file=${encodeURIComponent(fileName)}`,
          });
        } catch (error) {
          await fs.rm(absoluteImagePath, { force: true });
          const duplicate = await prisma.certificate.findUnique({
            where: { batchId_rowIndex: { batchId, rowIndex } },
          });
          if (duplicate) {
            results.push(existingCertificateResult(duplicate));
            continue;
          }
          throw error;
        }
      } catch {
        results.push({ fullName: row.fullName, status: "error", error: "Certificate could not be generated" });
      }
    }

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: "Certificate generation request failed" }, { status: 500 });
  }
}
