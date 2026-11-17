export type CertificateEmailInput = {
  recipientName: string;
  message: string;
  verifyUrl: string;
  issuerName: string;
  issuerShortName?: string;
  websiteUrl?: string;
  linkedinUrl?: string;
  supportEmail?: string;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

export function renderCertificateEmail(input: CertificateEmailInput): string {
  const links = [input.websiteUrl, input.linkedinUrl].filter((value): value is string => Boolean(value));
  const organizationLink = links.map((url) =>
    `<a href="${escapeHtml(url)}" rel="noopener noreferrer">${escapeHtml(input.issuerName)}</a>`
  ).join(" · ");
  const support = input.supportEmail
    ? `<p>Support: <a href="mailto:${escapeHtml(input.supportEmail)}">${escapeHtml(input.supportEmail)}</a></p>`
    : "";
  const linkedinSection = input.linkedinUrl
    ? `<p>Download &amp; share your achievement on LinkedIn and mention our page to shine! ✨</p>
    <p style="text-align:center"><a href="${escapeHtml(input.linkedinUrl)}" rel="noopener noreferrer" style="display:inline-block;background:#0077b5;color:#fff;padding:10px 20px;text-decoration:none;border-radius:5px;font-weight:bold">Follow ${escapeHtml(input.issuerShortName || input.issuerName)} on LinkedIn</a></p>
    <p>For further opportunities and updates.</p>`
    : "";

  return `<!doctype html>
<html><body style="margin:0;background:#f4f4f5;font-family:Arial,sans-serif;color:#27272a;line-height:1.6">
  <main style="max-width:600px;margin:24px auto;padding:24px;background:#fff;border-radius:12px">
    <h1 style="font-size:24px">Congratulations, ${escapeHtml(input.recipientName)}!</h1>
    <p>${escapeHtml(input.message).replace(/\r\n|\r|\n/g, "<br>")}</p>
    <p>Your certificate is attached to this email. You can also verify it online anytime either via the QR code directly from the certificate or this link:</p>
    <p style="text-align:center"><a href="${escapeHtml(input.verifyUrl)}" rel="noopener noreferrer">Verify Certificate Online</a></p>
    <p>Keep this certificate safe as proof of your achievement!</p>
    ${linkedinSection}
    ${support}
    <hr style="border:0;border-top:1px solid #e4e4e7;margin:24px 0">
    <footer style="font-size:12px;color:#71717a">Issued by ${organizationLink || escapeHtml(input.issuerName)}</footer>
  </main>
</body></html>`;
}
