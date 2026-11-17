import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAdminAuthorized, isSameOrigin } from "../lib/admin-auth";

describe("admin authentication helpers", () => {
  it("accepts only matching Basic credentials", () => {
    const valid = `Basic ${Buffer.from("operator:correct-horse").toString("base64")}`;
    const wrongPassword = `Basic ${Buffer.from("operator:incorrect").toString("base64")}`;

    assert.equal(isAdminAuthorized(valid, "operator", "correct-horse"), true);
    assert.equal(isAdminAuthorized(wrongPassword, "operator", "correct-horse"), false);
    assert.equal(isAdminAuthorized("Bearer token", "operator", "correct-horse"), false);
    assert.equal(isAdminAuthorized(null, "operator", "correct-horse"), false);
  });

  it("allows only same-origin mutation requests", () => {
    assert.equal(isSameOrigin("https://admin.example.com", "https://admin.example.com/api/send"), true);
    assert.equal(isSameOrigin("https://attacker.example", "https://admin.example.com"), false);
    assert.equal(isSameOrigin(null, "https://admin.example.com"), false);
  });
});
