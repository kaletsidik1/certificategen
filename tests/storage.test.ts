import assert from "node:assert/strict";
import path from "node:path";
import { after, describe, it } from "node:test";
import {
  getStorageRoot,
  resolveGeneratedImage,
  resolveStoredFile,
  resolveTemplateFile,
} from "../lib/storage";

const originalStorageDirectory = process.env.CERTIFICATE_STORAGE_DIR;
process.env.CERTIFICATE_STORAGE_DIR = path.join(process.cwd(), "test-storage-root");

after(() => {
  if (originalStorageDirectory === undefined) delete process.env.CERTIFICATE_STORAGE_DIR;
  else process.env.CERTIFICATE_STORAGE_DIR = originalStorageDirectory;
});

describe("storage path validation", () => {
  it("resolves allowed files only under their configured storage area", () => {
    assert.equal(
      resolveGeneratedImage("CERT-2026-ABC123.png"),
      path.join(getStorageRoot(), "images", "CERT-2026-ABC123.png")
    );
    assert.equal(
      resolveTemplateFile("template-12345678-1234-4234-8234-123456789abc.png"),
      path.join(getStorageRoot(), "templates", "template-12345678-1234-4234-8234-123456789abc.png")
    );
    assert.throws(() => resolveStoredFile("images", "../templates/private.png"));
    assert.throws(() => resolveGeneratedImage("../private.png"));
    assert.throws(() => resolveTemplateFile("..\\private.png"));
  });
});
