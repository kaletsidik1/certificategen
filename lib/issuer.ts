export type IssuerConfig = {
  name: string;
  websiteUrl?: string;
  linkedinUrl?: string;
  supportEmail?: string;
  locale: string;
  defaultEmailSubject: string;
  defaultEmailMessage: string;
  certificateNumberPrefix: string;
};

const DEFAULT_EMAIL_MESSAGE =
  "Congratulations on completing your program with {issuer}! Thank you for your patience while we prepared your certificate. We appreciate your time with us and wish you continued success.";

function optionalHttpsUrl(value: string | undefined, variable: string): string | undefined {
  const candidate = value?.trim();
  if (!candidate) return undefined;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error(`${variable} must be a valid HTTPS URL`);
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error(`${variable} must be a valid HTTPS URL`);
  }
  return url.toString();
}

function applyIssuerPlaceholder(value: string, issuerName: string): string {
  return value.replaceAll("{issuer}", issuerName);
}

export function getIssuerConfig(): IssuerConfig {
  const name = process.env.ISSUER_NAME?.trim() || "Certificate Issuer";
  const subjectTemplate =
    process.env.DEFAULT_EMAIL_SUBJECT?.trim() || "Your certificate from {issuer}";
  const messageTemplate =
    process.env.DEFAULT_EMAIL_MESSAGE?.trim() || DEFAULT_EMAIL_MESSAGE;
  const certificateNumberPrefix =
    process.env.CERTIFICATE_NUMBER_PREFIX?.trim().toUpperCase() || "CERT";
  const locale = process.env.ISSUER_LOCALE?.trim() || "en-US";

  if (name.length > 120) throw new Error("ISSUER_NAME must be 120 characters or fewer");
  if (process.env.NODE_ENV === "production" && name === "Certificate Issuer") {
    throw new Error("ISSUER_NAME must be configured before production issuance");
  }
  if (subjectTemplate.length > 200 || /[\r\n]/.test(subjectTemplate)) {
    throw new Error("DEFAULT_EMAIL_SUBJECT must be a single line of at most 200 characters");
  }
  if (messageTemplate.length > 5000) {
    throw new Error("DEFAULT_EMAIL_MESSAGE must be 5000 characters or fewer");
  }
  if (!/^[A-Z0-9-]{1,12}$/.test(certificateNumberPrefix)) {
    throw new Error("CERTIFICATE_NUMBER_PREFIX may contain 1–12 letters, numbers, or hyphens");
  }
  try {
    new Intl.DateTimeFormat(locale);
  } catch {
    throw new Error("ISSUER_LOCALE must be a supported BCP 47 locale");
  }

  const supportEmail = process.env.ISSUER_SUPPORT_EMAIL?.trim();
  if (supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) {
    throw new Error("ISSUER_SUPPORT_EMAIL must be a valid email address");
  }

  return {
    name,
    websiteUrl: optionalHttpsUrl(process.env.ISSUER_WEBSITE_URL, "ISSUER_WEBSITE_URL"),
    linkedinUrl: optionalHttpsUrl(process.env.ISSUER_LINKEDIN_URL, "ISSUER_LINKEDIN_URL"),
    supportEmail,
    locale,
    defaultEmailSubject: applyIssuerPlaceholder(subjectTemplate, name),
    defaultEmailMessage: applyIssuerPlaceholder(messageTemplate, name),
    certificateNumberPrefix,
  };
}

export function getAppUrl(): string {
  const configured = process.env.APP_URL?.trim();
  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("APP_URL must be configured in production");
    }
    return "http://127.0.0.1:3000";
  }

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("APP_URL must be a valid absolute URL");
  }
  if (url.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new Error("APP_URL must use HTTPS in production");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("APP_URL must use HTTP or HTTPS");
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("APP_URL must be an origin without credentials, a path, a query, or a fragment");
  }
  return url.toString().replace(/\/$/, "");
}
