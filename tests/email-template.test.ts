import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderCertificateEmail } from "../lib/email-template";

describe("certificate email template", () => {
  it("personalizes the greeting and links verification and issuer social actions", () => {
    const html = renderCertificateEmail({
      recipientName: "Kaletsidik Ayalew",
      message: "Congratulations on completing your bootcamp with the AAU Tech Club!",
      verifyUrl: "https://certificates.example.org/verify/ATC-2026-ABC123",
      issuerName: "Addis Ababa University Technology Club",
      issuerShortName: "ATC",
      websiteUrl: "https://techclub-lac.vercel.app/",
      linkedinUrl: "https://www.linkedin.com/company/aau-tech-club/",
    });

    assert.match(html, /Congratulations, Kaletsidik Ayalew!/);
    assert.match(html, /Your certificate is attached to this email/);
    assert.match(html, /href="https:\/\/certificates\.example\.org\/verify\/ATC-2026-ABC123"[^>]*>Verify Certificate Online/);
    assert.match(html, /Download &amp; share your achievement on LinkedIn and mention our page to shine! ✨/);
    assert.match(html, /href="https:\/\/www\.linkedin\.com\/company\/aau-tech-club\/"[^>]*>Follow ATC on LinkedIn/);
    assert.match(html, /For further opportunities and updates\./);
  });

  it("escapes message HTML and omits LinkedIn prompts when no link is configured", () => {
    const html = renderCertificateEmail({
      recipientName: "Student <One>",
      message: "Hello <script>alert(1)</script> & welcome",
      verifyUrl: "https://certificates.example.org/verify/ATC-2026-ABC123",
      issuerName: "Example Organization",
    });

    assert.match(html, /Congratulations, Student &lt;One&gt;!/);
    assert.match(html, /Hello &lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; welcome/);
    assert.doesNotMatch(html, /<script>/);
    assert.doesNotMatch(html, /Download &amp; share your achievement/);
  });
});
