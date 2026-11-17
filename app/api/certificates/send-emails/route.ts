import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { getAppUrl, getIssuerConfig } from "@/lib/issuer";
import { resolveStoredFile } from "@/lib/storage";
import { sendEmail } from "@/lib/mail";

export const runtime = "nodejs";

type SendResult = {
  id: string;
  fullName?: string;
  email?: string;
  status: "sent" | "skipped" | "failed" | "error";
  reason?: string;
  error?: string;
};

const MAX_BATCH_SIZE = 100;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const SENDING_LEASE_MS = 15 * 60 * 1000;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

function isValidEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function formatName(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toLocaleUpperCase() + word.slice(1).toLocaleLowerCase())
    .join(" ");
}

function renderEmail(input: {
  recipientName: string;
  message: string;
  verifyUrl: string;
  issuerName: string;
  websiteUrl?: string;
  linkedinUrl?: string;
  supportEmail?: string;
}): string {
  const links = [input.websiteUrl, input.linkedinUrl].filter((value): value is string => Boolean(value));
  const organizationLink = links.map((url) =>
    `<a href="${escapeHtml(url)}" rel="noopener noreferrer">${escapeHtml(input.issuerName)}</a>`
  ).join(" · ");
  const support = input.supportEmail
    ? `<p>Support: <a href="mailto:${escapeHtml(input.supportEmail)}">${escapeHtml(input.supportEmail)}</a></p>`
    : "";

  return `<!doctype html>
<html><body style="margin:0;background:#f4f4f5;font-family:Arial,sans-serif;color:#27272a;line-height:1.6">
  <main style="max-width:600px;margin:24px auto;padding:24px;background:#fff;border-radius:12px">
    <h1 style="font-size:24px">Congratulations, ${escapeHtml(input.recipientName)}!</h1>
    <p>${escapeHtml(input.message).replace(/\r\n|\r|\n/g, "<br>")}</p>
    <p>Your certificate is attached. You can also verify it online:</p>
    <p><a href="${escapeHtml(input.verifyUrl)}" rel="noopener noreferrer">Verify certificate</a></p>
    <p>Keep your certificate safe as proof of your achievement.</p>
    ${support}
    <hr style="border:0;border-top:1px solid #e4e4e7;margin:24px 0">
    <footer style="font-size:12px;color:#71717a">Issued by ${organizationLink || escapeHtml(input.issuerName)}</footer>
  </main>
</body></html>`;
}

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 128 * 1024) {
      return NextResponse.json({ error: "Email request is too large" }, { status: 413 });
    }
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid email request" }, { status: 400 });
    }
    const payload = body as Record<string, unknown>;
    if (!Array.isArray(payload.certificateIds) || payload.certificateIds.length === 0 || payload.certificateIds.length > MAX_BATCH_SIZE) {
      return NextResponse.json({ error: `certificateIds must contain 1 to ${MAX_BATCH_SIZE} IDs` }, { status: 400 });
    }

    const certificateIds = [...new Set(payload.certificateIds)];
    if (certificateIds.some((id) => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))) {
      return NextResponse.json({ error: "certificateIds contains an invalid ID" }, { status: 400 });
    }

    const issuer = getIssuerConfig();
    const appUrl = getAppUrl();
    const emailSubject =
      typeof payload.customSubject === "string" && payload.customSubject.trim()
        ? payload.customSubject.trim()
        : issuer.defaultEmailSubject;
    const messageText =
      typeof payload.customMessage === "string" && payload.customMessage.trim()
        ? payload.customMessage.trim()
        : issuer.defaultEmailMessage;
    if (!emailSubject || emailSubject.length > 200 || /[\r\n]/.test(emailSubject)) {
      return NextResponse.json({ error: "Email subject must be a single line of at most 200 characters" }, { status: 400 });
    }
    if (messageText.length > 5000) {
      return NextResponse.json({ error: "Email message must be 5000 characters or fewer" }, { status: 400 });
    }

    const results: SendResult[] = [];
    const staleLeaseBefore = new Date(Date.now() - SENDING_LEASE_MS);

    for (const certificateId of certificateIds as string[]) {
      let claimed = false;
      try {
        const certificate = await prisma.certificate.findUnique({ where: { id: certificateId } });
        if (!certificate) {
          results.push({ id: certificateId, status: "error", error: "Certificate not found" });
          continue;
        }
        if (certificate.emailStatus === "SUCCESS" || certificate.emailSentAt) {
          results.push({ id: certificateId, fullName: certificate.fullName, email: certificate.email ?? undefined, status: "skipped", reason: "Already sent" });
          continue;
        }
        if (!certificate.email || !isValidEmail(certificate.email.trim())) {
          results.push({ id: certificateId, fullName: certificate.fullName, status: "skipped", reason: "No valid email address" });
          continue;
        }
        if (!certificate.imagePath) {
          results.push({ id: certificateId, fullName: certificate.fullName, email: certificate.email, status: "error", error: "Certificate image is unavailable" });
          continue;
        }

        const claim = await prisma.certificate.updateMany({
          where: {
            id: certificateId,
            emailSentAt: null,
            AND: [
              { OR: [{ emailStatus: null }, { emailStatus: { not: "SUCCESS" } }] },
              {
                OR: [
                  { emailStatus: { not: "SENDING" } },
                  { emailSendingAt: null },
                  { emailSendingAt: { lt: staleLeaseBefore } },
                ],
              },
            ],
          },
          data: { emailStatus: "SENDING", emailSendingAt: new Date(), emailError: null },
        });
        if (claim.count !== 1) {
          results.push({ id: certificateId, fullName: certificate.fullName, email: certificate.email, status: "skipped", reason: "Already sent or another send is in progress" });
          continue;
        }
        claimed = true;

        const imagePath = resolveStoredFile("images", certificate.imagePath);
        const imageBuffer = await fs.readFile(imagePath);
        if (imageBuffer.byteLength > MAX_ATTACHMENT_BYTES) {
          throw new Error("Certificate attachment exceeds the size limit");
        }
        const verifyUrl = `${appUrl}/verify/${encodeURIComponent(certificate.certificateNumber)}`;
        const html = renderEmail({
          recipientName: formatName(certificate.fullName),
          message: messageText,
          verifyUrl,
          issuerName: issuer.name,
          websiteUrl: issuer.websiteUrl,
          linkedinUrl: issuer.linkedinUrl,
          supportEmail: issuer.supportEmail,
        });

        const delivery = await sendEmail(
          certificate.email,
          emailSubject,
          html,
          [{ filename: `${certificate.certificateNumber}.png`, content: imageBuffer }]
        );
        if (!delivery.success) throw new Error("Email delivery failed");

        await prisma.certificate.update({
          where: { id: certificateId },
          data: { emailSentAt: new Date(), emailSendingAt: null, emailStatus: "SUCCESS", emailError: null },
        });
        results.push({ id: certificateId, fullName: certificate.fullName, email: certificate.email, status: "sent" });
      } catch {
        if (claimed) {
          await prisma.certificate.updateMany({
            where: { id: certificateId, emailStatus: "SENDING" },
            data: { emailStatus: "FAILED", emailSendingAt: null, emailError: "Email delivery failed" },
          }).catch(() => undefined);
        }
        results.push({ id: certificateId, status: "failed", error: "Email delivery failed" });
      }
    }

    const sent = results.filter((result) => result.status === "sent").length;
    const failed = results.filter((result) => result.status === "failed" || result.status === "error").length;
    return NextResponse.json({
      results,
      summary: {
        total: certificateIds.length,
        sent,
        failed,
        skipped: results.filter((result) => result.status === "skipped").length,
      },
    });
  } catch {
    return NextResponse.json({ error: "Email request failed" }, { status: 500 });
  }
}
