import nodemailer from "nodemailer";

type CertificateAttachment = { filename: string; content: Buffer };

function createTransporter() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.EMAIL_FROM?.trim();

  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !user || !pass || !from) {
    throw new Error("SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and EMAIL_FROM must be configured");
  }
  if (/[\r\n]/.test(from)) throw new Error("EMAIL_FROM must be a single-line address");

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  attachments: CertificateAttachment[] = []
): Promise<{ success: boolean }> {
  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: process.env.EMAIL_FROM?.trim(),
      to,
      subject,
      html,
      attachments,
    });
    return { success: true };
  } catch {
    return { success: false };
  }
}
