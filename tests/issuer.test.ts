import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getIssuerConfig } from "../lib/issuer";

const CONFIG_KEYS = [
  "ISSUER_NAME",
  "ISSUER_SHORT_NAME",
  "ISSUER_WEBSITE_URL",
  "ISSUER_LINKEDIN_URL",
  "ISSUER_SUPPORT_EMAIL",
  "ISSUER_LOCALE",
  "CERTIFICATE_NUMBER_PREFIX",
  "DEFAULT_EMAIL_SUBJECT",
  "DEFAULT_EMAIL_MESSAGE",
] as const;

describe("issuer email defaults", () => {
  it("applies issuer placeholders and keeps batch defaults configurable", () => {
    const originalValues = new Map(CONFIG_KEYS.map((key) => [key, process.env[key]]));
    Object.assign(process.env, {
      ISSUER_NAME: "Example Institute",
      ISSUER_SHORT_NAME: "EI",
      ISSUER_WEBSITE_URL: "https://example.org",
      ISSUER_LINKEDIN_URL: "https://www.linkedin.com/company/example-institute/",
      ISSUER_LOCALE: "en-US",
      CERTIFICATE_NUMBER_PREFIX: "EI",
      DEFAULT_EMAIL_SUBJECT: "Your {issuer} Bootcamp Certificate",
      DEFAULT_EMAIL_MESSAGE: "Congratulations on completing your bootcamp with {issuer}!",
    });

    try {
      const config = getIssuerConfig();
      assert.equal(config.name, "Example Institute");
      assert.equal(config.shortName, "EI");
      assert.equal(config.defaultEmailSubject, "Your Example Institute Bootcamp Certificate");
      assert.equal(config.defaultEmailMessage, "Congratulations on completing your bootcamp with Example Institute!");
      assert.equal(config.linkedinUrl, "https://www.linkedin.com/company/example-institute/");
    } finally {
      for (const key of CONFIG_KEYS) {
        const originalValue = originalValues.get(key);
        if (originalValue === undefined) delete process.env[key];
        else process.env[key] = originalValue;
      }
    }
  });
});
