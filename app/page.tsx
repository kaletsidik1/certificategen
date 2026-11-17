"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

type PreviewRow = { fullName: string; email?: string };
type GenerationResult =
  | {
      id: string;
      status: "created";
      certificateNumber: string;
      imageUrl: string;
      fullName: string;
    }
  | { status: "error"; fullName?: string; error?: string }
  | { status: "skipped"; certificateNumber?: string; fullName?: string };
type EmailResult = {
  id?: string;
  fullName?: string;
  email?: string;
  status: "sent" | "skipped" | "failed" | "error";
  reason?: string;
  error?: string;
};
type EmailSummary = { sent?: number; failed?: number; skipped?: number };
type SendEmailsResponse = {
  error?: string;
  results?: EmailResult[];
  summary?: EmailSummary;
};
type PublicIssuerConfig = {
  name: string;
  websiteUrl?: string;
  linkedinUrl?: string;
  supportEmail?: string;
  defaultEmailSubject: string;
  defaultEmailMessage: string;
  appUrl: string;
};

const GENERATED_CERTIFICATE_IDS_KEY = "certificate-platform-generated-certificate-ids";
const LEGACY_GENERATED_CERTIFICATE_IDS_KEY = "aau-generated-certificate-ids";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200/60 bg-white/60 p-5 shadow-sm backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/60">
      <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        {title}
      </h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export default function Home() {
  // Data Source
  const [sheetUrl, setSheetUrl] = useState("");
  const [programName, setProgramName] = useState("Certificate Program");
  const [issuerName, setIssuerName] = useState("Certificate Issuer");
  const [publicAppUrl, setPublicAppUrl] = useState("");
  const [configurationStatus, setConfigurationStatus] = useState<"loading" | "ready" | "error">("loading");
  const [isLoadingSheet, setIsLoadingSheet] = useState(false);
  const [isUploadingTemplate, setIsUploadingTemplate] = useState(false);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [allRows, setAllRows] = useState<PreviewRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);

  // Template
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [nameX, setNameX] = useState(300);
  const [nameY, setNameY] = useState(300);
  const [qrX, setQrX] = useState(100);
  const [qrY, setQrY] = useState(100);
  const [fontSize, setFontSize] = useState(48);
  const fontFamily = "Inter";
  const [fontWeight, setFontWeight] = useState("600");
  const [fontColor, setFontColor] = useState("#000000");
  const [sampleName, setSampleName] = useState("Jane Doe");
  const [qrSize, setQrSize] = useState(200);
  const [lastPreview, setLastPreview] = useState<{
    imageUrl: string;
    certificateNumber: string;
    fullName: string;
  } | null>(null);
  const [statusOne, setStatusOne] = useState<{
    state: "idle" | "loading" | "done" | "error";
    message?: string;
  }>({ state: "idle" });
  const [statusTen, setStatusTen] = useState<{
    state: "idle" | "loading" | "done" | "error";
    created?: number;
    errors?: number;
    message?: string;
  }>({ state: "idle" });
  const [statusAll, setStatusAll] = useState<{
    state: "idle" | "loading" | "done" | "error";
    created?: number;
    errors?: number;
    message?: string;
  }>({ state: "idle" });
  const [customSubject, setCustomSubject] = useState("Your certificate from Certificate Issuer");
  const [customMessage, setCustomMessage] = useState(
    "Congratulations on completing your program with Certificate Issuer! We are pleased to share your certificate and wish you continued success."
  );
  const [generatedCertificateIds, setGeneratedCertificateIds] = useState<string[]>([]);
  const [emailStatus, setEmailStatus] = useState<{
    state: "idle" | "loading" | "done" | "error";
    sent?: number;
    failed?: number;
    message?: string;
  }>({ state: "idle" });
  const [emailLogs, setEmailLogs] = useState<Array<{
    fullName: string;
    email?: string;
    status: "sent" | "skipped" | "failed" | "error";
    reason?: string;
    error?: string;
  }>>([]);
  const [emailFilter, setEmailFilter] = useState<"all" | "sent" | "skipped" | "failed">("all");

  useEffect(() => {
    try {
      const currentQueue = sessionStorage.getItem(GENERATED_CERTIFICATE_IDS_KEY);
      const stored = currentQueue ?? sessionStorage.getItem(LEGACY_GENERATED_CERTIFICATE_IDS_KEY);
      const parsed: unknown = stored ? JSON.parse(stored) : [];
      if (Array.isArray(parsed)) {
        const ids = parsed.filter((id): id is string => typeof id === "string");
        setGeneratedCertificateIds(ids);
        if (!currentQueue && ids.length > 0) {
          sessionStorage.setItem(GENERATED_CERTIFICATE_IDS_KEY, JSON.stringify(ids));
        }
        sessionStorage.removeItem(LEGACY_GENERATED_CERTIFICATE_IDS_KEY);
      }
    } catch {
      // Ignore malformed or unavailable session storage.
    }
  }, []);

  function saveGeneratedCertificateIds(ids: string[]) {
    const uniqueIds = Array.from(new Set(ids));
    setGeneratedCertificateIds(uniqueIds);
    try {
      if (uniqueIds.length > 0) {
        sessionStorage.setItem(
          GENERATED_CERTIFICATE_IDS_KEY,
          JSON.stringify(uniqueIds)
        );
      } else {
        sessionStorage.removeItem(GENERATED_CERTIFICATE_IDS_KEY);
      }
    } catch {
      // The in-memory queue remains usable if session storage is unavailable.
    }
  }

  // Live preview helpers
  const objectUrl = useMemo(
    () => (templateFile ? URL.createObjectURL(templateFile) : null),
    [templateFile]
  );
  const fullContainerRef = useRef<HTMLDivElement | null>(null);
  const [naturalSize, setNaturalSize] = useState<{
    w: number;
    h: number;
  } | null>(null);
  const [placeMode, setPlaceMode] = useState<"name" | "qr">("name");
  const [dragging, setDragging] = useState<"name" | "qr" | null>(null);
  const [showFull, setShowFull] = useState(false);
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);
  useEffect(() => {
    if (preview && preview.length > 0) {
      setSampleName(preview[0].fullName || "");
    }
  }, [preview]);
  useEffect(() => {
    if (objectUrl) setShowFull(true);
  }, [objectUrl]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/config", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load issuer configuration");
        return (await response.json()) as PublicIssuerConfig;
      })
      .then((config) => {
        if (cancelled) return;
        setIssuerName(config.name);
        setPublicAppUrl(config.appUrl);
        setCustomSubject(config.defaultEmailSubject);
        setCustomMessage(config.defaultEmailMessage);
        setProgramName(`${config.name} Program`);
        setConfigurationStatus("ready");
      })
      .catch(() => {
        setConfigurationStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function mapToDisplay(x: number, y: number) {
    const container = fullContainerRef.current;
    if (!container || !naturalSize) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    const scale = Math.min(
      rect.width / naturalSize.w,
      rect.height / naturalSize.h
    );
    const dispW = naturalSize.w * scale;
    const dispH = naturalSize.h * scale;
    const offsetX = (rect.width - dispW) / 2;
    const offsetY = (rect.height - dispH) / 2;
    return {
      x: Math.round(offsetX + x * scale),
      y: Math.round(offsetY + y * scale),
    };
  }
  function displayToPixel(displayX: number, displayY: number) {
    const container = fullContainerRef.current;
    if (!container || !naturalSize) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    const scale = Math.min(
      rect.width / naturalSize.w,
      rect.height / naturalSize.h
    );
    const dispW = naturalSize.w * scale;
    const dispH = naturalSize.h * scale;
    const offsetX = (rect.width - dispW) / 2;
    const offsetY = (rect.height - dispH) / 2;
    const pxX = Math.round((displayX - offsetX) / scale);
    const pxY = Math.round((displayY - offsetY) / scale);
    return { x: Math.max(0, pxX), y: Math.max(0, pxY) };
  }

  function getDisplayScale() {
    const container = fullContainerRef.current;
    if (!container || !naturalSize) return 1;
    const rect = container.getBoundingClientRect();
    return Math.min(rect.width / naturalSize.w, rect.height / naturalSize.h);
  }

  useEffect(() => {
    if (!showFull) return;
    const handler = (e: KeyboardEvent) => {
      if (!naturalSize) return;
      const step = e.shiftKey ? 10 : 2;
      let dx = 0;
      let dy = 0;
      if (e.key === "ArrowUp") dy = -step;
      if (e.key === "ArrowDown") dy = step;
      if (e.key === "ArrowLeft") dx = -step;
      if (e.key === "ArrowRight") dx = step;
      if (!dx && !dy) return;
      e.preventDefault();
      const clamp = (val: number, max: number) =>
        Math.max(0, Math.min(val, max));
      if (placeMode === "name") {
        setNameX((x) => clamp(x + dx, naturalSize.w));
        setNameY((y) => clamp(y + dy, naturalSize.h));
      } else {
        const qrMax = Math.max(0, naturalSize.w - qrSize);
        const qrMaxY = Math.max(0, naturalSize.h - qrSize);
        setQrX((x) => clamp(x + dx, qrMax));
        setQrY((y) => clamp(y + dy, qrMaxY));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showFull, placeMode, naturalSize, qrSize]);

  const [log, setLog] = useState<string[]>([]);

  async function ingestSheet() {
    if (!sheetUrl.trim()) {
      setLog((entries) => [...entries, "Enter a Google Sheets URL first"]);
      return;
    }
    setIsLoadingSheet(true);
    try {
      setLog((l) => [...l, "Reading Google Sheet..."]);
      const res = await fetch("/api/sheets/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load Google Sheet");
      setBatchId(data.batchId);
      setPreview(data.preview ?? []);
      setAllRows(data.rows ?? []);
      setTotal(data.total ?? 0);
      setLog((l) => [...l, `Loaded ${data.total} rows`]);
    } catch (error) {
      setLog((entries) => [...entries, `Error: ${error instanceof Error ? error.message : "Could not load Google Sheet"}`]);
    } finally {
      setIsLoadingSheet(false);
    }
  }

  async function uploadTemplate(): Promise<boolean> {
    if (!templateFile) {
      setLog((l) => [...l, "Select a template file first"]);
      return false;
    }
    if (!naturalSize) {
      setLog((l) => [...l, "Template hasn't loaded yet. Please wait."]);
      return false;
    }
    const fd = new FormData();
    fd.append("file", templateFile);
    fd.append("nameX", String(nameX));
    fd.append("nameY", String(nameY));
    fd.append("qrX", String(qrX));
    fd.append("qrY", String(qrY));
    fd.append("fontSize", String(fontSize));
    fd.append("qrSize", String(qrSize));
    fd.append("fontFamily", fontFamily);
    fd.append("fontWeight", fontWeight);
    fd.append("fontColor", fontColor);

    setIsUploadingTemplate(true);
    try {
      setLog((l) => [...l, "Uploading template..."]);
      const res = await fetch("/api/templates", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Template upload failed");
      setTemplateId(data.template.id);
      setLog((l) => [...l, `Template saved: ${data.template.id}`]);
      return true;
    } catch (error) {
      setLog((entries) => [...entries, `Error: ${error instanceof Error ? error.message : "Template upload failed"}`]);
      return false;
    } finally {
      setIsUploadingTemplate(false);
    }
  }
  async function generateCertificates(limit?: number) {
    if (!canIssueCertificates) {
      setLog((entries) => [...entries, "Configure the issuer name and public HTTPS APP_URL before issuing certificates"]);
      return;
    }
    if (!batchId || !templateId) {
      setLog((l) => [...l, "Ingest sheet and upload template first"]);
      if (limit)
        setStatusTen({ state: "error", message: "Load sheet & template" });
      else setStatusAll({ state: "error", message: "Load sheet & template" });
      return;
    }

    if (generatedCertificateIds.length > 0) {
      const message =
        "Send or reconcile the current generated certificates before starting another batch.";
      setLog((l) => [...l, message]);
      if (limit) setStatusTen({ state: "error", message });
      else setStatusAll({ state: "error", message });
      return;
    }

    const rowsToProcess = limit ? allRows.slice(0, limit) : allRows;
    if (rowsToProcess.length === 0) {
      setLog((entries) => [...entries, "Load a non-empty roster before generating certificates"]);
      if (limit) setStatusTen({ state: "error", message: "No roster rows loaded" });
      else setStatusAll({ state: "error", message: "No roster rows loaded" });
      return;
    }
    saveGeneratedCertificateIds([]);
    setEmailStatus({ state: "idle" });
    setEmailLogs([]);

    if (limit) setStatusTen({ state: "loading" });
    else {
      setStatusAll({
        state: "loading",
        created: 0,
        errors: 0,
        message: "Starting chunked generation...",
      });
    }

    setLog((l) => [
      ...l,
      `Generating ${rowsToProcess.length} certificates in chunks...`,
    ]);

    const chunkSize = 10;
    const totalProcessed: GenerationResult[] = [];
    const batchCertificateIds: string[] = [];
    let totalCreated = 0;
    let totalErrorCount = 0;

    for (let i = 0; i < rowsToProcess.length; i += chunkSize) {
      const chunk = rowsToProcess.slice(i, i + chunkSize);
      const chunkNum = Math.floor(i / chunkSize) + 1;
      const totalChunks = Math.ceil(rowsToProcess.length / chunkSize);

      if (!limit) {
        setStatusAll((s) => ({
          ...s,
          message: `Processing chunk ${chunkNum}/${totalChunks}...`,
        }));
      }

      setLog((l) => [...l, `Processing chunk ${chunkNum}/${totalChunks}...`]);

      try {
        const res = await fetch("/api/certificates/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            batchId,
            templateId,
            programName,
            startIndex: i,
            rows: chunk,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Chunk generation failed");
        }

        const results: GenerationResult[] = data.results ?? [];
        totalProcessed.push(...results);
        batchCertificateIds.push(
          ...results
            .filter(
              (result): result is Extract<GenerationResult, { status: "created" }> =>
                result.status === "created"
            )
            .map((result) => result.id)
        );
        saveGeneratedCertificateIds(batchCertificateIds);

        const chunkCreated = results.filter(
          (r) => r.status === "created"
        ).length;
        const chunkErrors = results.filter((r) => r.status === "error");

        totalCreated += chunkCreated;
        totalErrorCount += chunkErrors.length;

        // Show preview of the first generated certificate in the FIRST chunk
        if (i === 0) {
          const firstCreated = results.find((r) => r.status === "created");
          if (firstCreated) {
            setLastPreview({
              imageUrl: firstCreated.imageUrl,
              certificateNumber: firstCreated.certificateNumber,
              fullName: firstCreated.fullName || "Unknown",
            });
            setLog((l) => [...l, `Preview: ${firstCreated.certificateNumber}`]);
          }
        }

        if (chunkErrors.length) {
          for (const err of chunkErrors) {
            setLog((l) => [...l, `Row '${err.fullName}': ${err.error}`]);
          }
        }

        // Update progress UI
        if (limit) {
          setStatusTen({
            state: i + chunkSize >= rowsToProcess.length ? "done" : "loading",
            created: totalCreated,
            errors: totalErrorCount,
          });
        } else {
          setStatusAll({
            state: i + chunkSize >= rowsToProcess.length ? "done" : "loading",
            created: totalCreated,
            errors: totalErrorCount,
            message:
              i + chunkSize >= rowsToProcess.length
                ? `Finished all chunks.`
                : `Progress: ${Math.min(i + chunkSize, rowsToProcess.length)}/${rowsToProcess.length}`,
          });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setLog((l) => [...l, `Error in chunk ${chunkNum}: ${message}`]);
        if (limit) {
          setStatusTen({ state: "error", message });
        } else {
          setStatusAll((s) => ({
            ...s,
            state: "error",
            message: `Stopped at chunk ${chunkNum}: ${message}`,
          }));
        }
        return; // Stop processing further chunks on error
      }
    }

    setLog((l) => [
      ...l,
      `Batch finished. Total: ${totalCreated} success, ${totalErrorCount} errors.`,
    ]);
  }

  async function generateOne() {
    if (!canIssueCertificates) {
      setStatusOne({ state: "error", message: "Configure the issuer name and public HTTPS APP_URL first" });
      return;
    }
    if (generatedCertificateIds.length > 0) {
      setStatusOne({
        state: "error",
        message: "Send or reconcile the current generated certificates first.",
      });
      return;
    }
    if (!templateId || !batchId) {
      setLog((l) => [...l, "Load a roster and upload a template first"]);
      setStatusOne({ state: "error", message: "Load a roster and upload a template first" });
      return;
    }
    if (preview.length === 0) {
      setLog((l) => [...l, "Load sheet to pick a row"]);
      setStatusOne({ state: "error", message: "Load sheet to pick a row" });
      return;
    }
    const singleRow = preview[0];
    setStatusOne({
      state: "loading",
      message: `Creating a certificate for ${singleRow.fullName}...`,
    });
    setLog((l) => [...l, `Creating a saved certificate for ${singleRow.fullName}...`]);
    const res = await fetch("/api/certificates/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        batchId,
        templateId,
        programName,
        startIndex: 0,
        rows: [singleRow],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setLog((l) => [...l, `Error: ${data.error}`]);
      setStatusOne({ state: "error", message: String(data.error || "Error") });
      return;
    }
    const result = ((data.results ?? []) as GenerationResult[])[0];
    if (result?.status === "created") {
      saveGeneratedCertificateIds([result.id]);
      setLastPreview({
        imageUrl: result.imageUrl,
        certificateNumber: result.certificateNumber,
        fullName: singleRow.fullName,
      });
      setLog((l) => [...l, `Certificate created: ${result.certificateNumber}`]);
      setStatusOne({ state: "done", message: "Certificate created and saved" });
    } else {
      setLog((l) => [...l, "Preview generation failed"]);
      setStatusOne({ state: "error", message: "Preview generation failed" });
    }
  }

  async function sendEmails() {
    if (!canIssueCertificates) {
      setEmailStatus({ state: "error", message: "Configure the issuer name and public HTTPS APP_URL first" });
      return;
    }
    if (generatedCertificateIds.length === 0) {
      setLog((l) => [...l, "Generate certificates for this batch before sending emails"]);
      setEmailStatus({ state: "error", message: "No generated certificates queued" });
      return;
    }

    setEmailStatus({ state: "loading" });
    const certificateIds = [...generatedCertificateIds];
    const results: EmailResult[] = [];
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    try {
      setLog((l) => [...l, `Sending emails for ${certificateIds.length} queued certificates...`]);
      setEmailLogs([]);
      for (const [index, certificateId] of certificateIds.entries()) {
        // Persist the current and remaining IDs before each request so a tab/network failure is recoverable.
        saveGeneratedCertificateIds(certificateIds.slice(index));
        setEmailStatus({ state: "loading", sent, failed, message: `Processing ${index + 1}/${certificateIds.length}…` });
        const emailRes = await fetch("/api/certificates/send-emails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ certificateIds: [certificateId], customSubject, customMessage }),
        });
        const emailData = (await emailRes.json()) as SendEmailsResponse;
        if (!emailRes.ok) throw new Error(emailData.error || "Email request failed");

        const result = emailData.results?.[0];
        if (!result) throw new Error("The email service returned no result for this certificate");
        results.push(result);
        if (result.status === "sent") sent++;
        else if (result.status === "failed" || result.status === "error") failed++;
        else skipped++;

        const retryIds = results
          .filter((entry) => entry.status === "failed" || entry.status === "error")
          .map((entry) => entry.id)
          .filter((id): id is string => typeof id === "string");
        saveGeneratedCertificateIds([...retryIds, ...certificateIds.slice(index + 1)]);
        setEmailLogs(results.map((entry) => ({
          fullName: entry.fullName || "Unknown",
          email: entry.email,
          status: entry.status,
          reason: entry.reason,
          error: entry.error,
        })));
      }
      setLog((l) => [
        ...l,
        `Emails sent: ${sent} successful, ${failed} failed, ${skipped} skipped`,
      ]);
      setEmailStatus({ state: "done", sent, failed });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Email request failed";
      setLog((entries) => [...entries, `Error: ${message}`]);
      setEmailStatus({ state: "error", message });
    }
  }

  const filteredEmailLogs = emailLogs.filter((entry) => {
    if (emailFilter === "all") return true;
    if (emailFilter === "failed") {
      return entry.status === "failed" || entry.status === "error";
    }
    return entry.status === emailFilter;
  });
  const isGenerating = [statusOne.state, statusTen.state, statusAll.state].includes("loading");
  const canIssueCertificates =
    configurationStatus === "ready" &&
    issuerName !== "Certificate Issuer" &&
    publicAppUrl.startsWith("https://");

  return (
    <div className="min-h-screen bg-zinc-50/50 dark:bg-zinc-950/50">
      <div className="w-full px-6 py-8">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {issuerName} Certificate Admin
            </h1>
          </div>
        </header>

        {!canIssueCertificates && (
          <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            {configurationStatus === "error"
              ? "Issuer configuration could not be loaded. Check the server configuration before issuing."
              : "Issuance is paused until ISSUER_NAME is set to the correct organization and APP_URL is the public HTTPS verification origin. A localhost QR link is not suitable for graduate certificates."}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <Section title="Data Source">
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Program or cohort name
              </label>
              <input
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-2 ring-transparent focus:ring-zinc-300 dark:border-zinc-800 dark:bg-zinc-900"
                value={programName}
                maxLength={200}
                onChange={(event) => setProgramName(event.target.value)}
              />
            </div>
            <input
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-2 ring-transparent focus:ring-zinc-300 dark:border-zinc-800 dark:bg-zinc-900"
              placeholder="Paste Google Sheets URL"
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
            />
            <button
              className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              onClick={ingestSheet}
              disabled={isLoadingSheet}
            >
              {isLoadingSheet ? "Loading sheet…" : "Load Sheet"}
            </button>
            {total !== null && (
              <div className="text-sm text-zinc-700 dark:text-zinc-300">
                Total rows detected: {total}
              </div>
            )}
            {preview.length > 0 && (
              <div className="mt-3 rounded-xl border border-zinc-200 bg-white/70 p-3 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
                <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  <span>Loaded rows</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-100">
                    {preview.length}
                  </span>
                </div>
                <div className="max-h-48 overflow-auto">
                  <ul className="space-y-2 text-sm">
                    {preview.map((r, i) => (
                      <li
                        key={i}
                        className="rounded-lg border border-zinc-100 bg-white px-3 py-2 shadow-[0_1px_1px_rgba(0,0,0,0.04)] dark:border-zinc-800 dark:bg-zinc-900/80"
                      >
                        <div className="font-medium text-zinc-900 dark:text-zinc-100">
                          {r.fullName}
                        </div>
                        {r.email && (
                          <div className="text-xs text-zinc-500 dark:text-zinc-400">
                            {r.email}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </Section>

          <Section title="Certificate Template (PNG)">
            <div className="space-y-2">
              <input
                type="file"
                accept="image/png"
                onChange={(e) => setTemplateFile(e.target.files?.[0] ?? null)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-2 ring-transparent focus:ring-zinc-300 dark:border-zinc-800 dark:bg-zinc-900"
              />
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Upload a PNG certificate template for best results. PDF templates
                are not supported.
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-500">
                Edits are applied only after selecting &quot;Use This Template&quot; in the
                editor.
              </p>
              {/* Full-screen positioning opens automatically when a template is chosen */}
              {objectUrl && (
                <button
                  className="mt-2 inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
                  onClick={() => setShowFull(true)}
                >
                  Edit Positioning (Full Screen)
                </button>
              )}
              {templateId && (
                <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-3 text-sm text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                  Template uploaded. Open the editor to adjust placements and
                  font.
                </div>
              )}
            </div>
            {/* Removed small preview; full-screen positioning is the primary view */}
          </Section>

          {showFull && objectUrl && (
            <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm">
              <div className="absolute left-0 right-0 top-0 flex items-center justify-between bg-black/50 px-4 py-3 text-white">
                <div className="flex items-center gap-3 text-sm">
                  <span>Drag markers to position</span>
                  <div className="flex items-center gap-1 rounded-full bg-white/10 p-1">
                    <span className="px-2 text-xs opacity-80">Position:</span>
                    <button
                      className={`rounded-full px-3 py-1 text-xs ${placeMode === "name"
                        ? "bg-white text-black"
                        : "bg-transparent hover:bg-white/20"
                        }`}
                      onClick={() => setPlaceMode("name")}
                      title="Position Name"
                    >
                      Name
                    </button>
                    <button
                      className={`rounded-full px-3 py-1 text-xs ${placeMode === "qr"
                        ? "bg-white text-black"
                        : "bg-transparent hover:bg-white/20"
                        }`}
                      onClick={() => setPlaceMode("qr")}
                      title="Position QR"
                    >
                      QR
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="hidden sm:flex items-center gap-2">
                    <span className="text-xs opacity-80">Font size</span>
                    <input
                      className="h-1.5 w-40 cursor-pointer appearance-none rounded bg-white/30 accent-white"
                      type="range"
                      min={16}
                      max={120}
                      value={fontSize}
                      onChange={(e) => setFontSize(Number(e.target.value))}
                    />
                    <span className="text-xs opacity-80 w-8 text-right">
                      {fontSize}
                    </span>
                  </div>
                  <div className="hidden sm:flex items-center gap-2">
                    <span className="text-xs opacity-80">QR size</span>
                    <input
                      className="h-1.5 w-40 cursor-pointer appearance-none rounded bg-white/30 accent-white"
                      type="range"
                      min={64}
                      max={600}
                      value={qrSize}
                      onChange={(e) => setQrSize(Number(e.target.value))}
                    />
                    <span className="text-xs opacity-80 w-10 text-right">
                      {qrSize}
                    </span>
                  </div>
                  <label className="hidden sm:flex items-center gap-2 text-xs opacity-80">
                    Weight
                    <select
                      className="rounded bg-white/20 px-2 py-1 text-xs text-white hover:bg-white/30"
                      value={fontWeight}
                      onChange={(e) => setFontWeight(e.target.value)}
                    >
                      <option value="400" className="text-black">
                        Normal
                      </option>
                      <option value="600" className="text-black">
                        Semi-bold
                      </option>
                      <option value="700" className="text-black">
                        Bold
                      </option>
                    </select>
                  </label>
                  <label className="hidden sm:flex items-center gap-2 text-xs opacity-80">
                    Color
                    <input
                      type="color"
                      className="h-7 w-10 cursor-pointer rounded border border-white/40 bg-white/10"
                      value={fontColor}
                      onChange={(e) => setFontColor(e.target.value)}
                    />
                  </label>
                  <button
                    className="rounded bg-emerald-600 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-700"
                    onClick={async () => {
                      if (await uploadTemplate()) setShowFull(false);
                    }}
                    disabled={isUploadingTemplate}
                  >
                    {isUploadingTemplate ? "Uploading…" : "Use This Template"}
                  </button>
                  <button
                    className="rounded bg-white/10 px-3 py-1 text-sm hover:bg-white/20"
                    onClick={() => setShowFull(false)}
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="absolute inset-0 top-12 p-4">
                <div
                  ref={fullContainerRef}
                  className="relative h-full w-full overflow-hidden rounded-lg border border-white/20"
                  onMouseMove={(e) => {
                    if (!dragging) return;
                    const pos = displayToPixel(e.clientX, e.clientY);
                    if (dragging === "name") {
                      setNameX(pos.x);
                      setNameY(pos.y);
                    } else {
                      setQrX(pos.x);
                      setQrY(pos.y);
                    }
                  }}
                  onMouseUp={() => setDragging(null)}
                  onMouseLeave={() => setDragging(null)}
                  onClick={(e) => {
                    const container = fullContainerRef.current;
                    if (!container || !naturalSize) return;
                    const rect = container.getBoundingClientRect();
                    const clickX = e.clientX - rect.left;
                    const clickY = e.clientY - rect.top;
                    const scale = Math.min(
                      rect.width / naturalSize.w,
                      rect.height / naturalSize.h
                    );
                    const dispW = naturalSize.w * scale;
                    const dispH = naturalSize.h * scale;
                    const offsetX = (rect.width - dispW) / 2;
                    const offsetY = (rect.height - dispH) / 2;
                    const pxX = Math.round((clickX - offsetX) / scale);
                    const pxY = Math.round((clickY - offsetY) / scale);
                    if (placeMode === "name") {
                      setNameX(Math.max(0, pxX));
                      setNameY(Math.max(0, pxY));
                    } else {
                      setQrX(Math.max(0, pxX));
                      setQrY(Math.max(0, pxY));
                    }
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={objectUrl}
                    alt="Template Full Preview"
                    className="h-full w-full object-contain"
                    onLoad={(e) => {
                      setNaturalSize({
                        w: e.currentTarget.naturalWidth,
                        h: e.currentTarget.naturalHeight,
                      });
                    }}
                  />
                  <div className="absolute inset-0">
                    {(() => {
                      const namePos = mapToDisplay(nameX, nameY);
                      const qrPos = mapToDisplay(qrX, qrY);
                      const scale = getDisplayScale();
                      const baselineDy = Math.round(fontSize * 0.12) * scale;
                      const qrDisp = Math.max(8, qrSize * scale);
                      return (
                        <>
                          <div
                            className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-move rounded px-1 text-xs font-semibold leading-none whitespace-nowrap drop-shadow ${placeMode === "name" ? "scale-105" : "opacity-90"
                              }`}
                            style={{
                              left: namePos.x,
                              top: namePos.y + baselineDy,
                              fontSize: `${fontSize * scale}px`,
                              fontFamily,
                              fontWeight,
                              color: fontColor,
                            }}
                            onMouseDown={() => {
                              setPlaceMode("name");
                              setDragging("name");
                            }}
                          >
                            {sampleName}
                          </div>
                          <div
                            className={`absolute cursor-move rounded border-2 border-indigo-500/80 bg-indigo-500/20 text-[10px] text-white ${placeMode === "qr" ? "ring-2 ring-white" : ""
                              }`}
                            style={{
                              left: qrPos.x,
                              top: qrPos.y,
                              width: qrDisp,
                              height: qrDisp,
                            }}
                            onMouseDown={() => {
                              setPlaceMode("qr");
                              setDragging("qr");
                            }}
                            title="QR position and size"
                          />
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )}

          <Section title="Generate Certificates">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Creates PNG certificates and stores them locally. Generate One saves a real database record; it is not a disposable preview.
            </p>
            {generatedCertificateIds.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                {generatedCertificateIds.length} saved certificate(s) are still queued for this batch. Send or reconcile this queue before generating another batch.
              </div>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
                onClick={generateOne}
                disabled={!canIssueCertificates || isGenerating || generatedCertificateIds.length > 0}
              >
                Generate One (saves certificate)
              </button>
              <button
                className="inline-flex items-center justify-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700"
                onClick={() => generateCertificates(10)}
                disabled={!canIssueCertificates || isGenerating || generatedCertificateIds.length > 0}
              >
                Generate First 10
              </button>
              <button
                className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                onClick={() => generateCertificates()}
                disabled={!canIssueCertificates || isGenerating || generatedCertificateIds.length > 0}
              >
                Generate All
              </button>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-zinc-200 bg-white/80 p-2 text-xs dark:border-zinc-800 dark:bg-zinc-900/70">
                <div className="font-semibold text-zinc-700 dark:text-zinc-200">
                  Preview
                </div>
                {statusOne.state === "idle" && (
                  <div className="text-zinc-500 dark:text-zinc-400">Idle</div>
                )}
                {statusOne.state === "loading" && (
                  <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300">
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-indigo-700 border-t-transparent dark:border-indigo-300"></span>
                    <span>{statusOne.message ?? "Generating preview..."}</span>
                  </div>
                )}
                {statusOne.state === "done" && (
                  <div className="text-emerald-700 dark:text-emerald-300">
                    Complete
                  </div>
                )}
                {statusOne.state === "error" && (
                  <div className="text-red-600 dark:text-red-400">
                    {statusOne.message ?? "Error"}
                  </div>
                )}
              </div>
              <div className="rounded-lg border border-zinc-200 bg-white/80 p-2 text-xs dark:border-zinc-800 dark:bg-zinc-900/70">
                <div className="font-semibold text-zinc-700 dark:text-zinc-200">
                  Batch x10
                </div>
                {statusTen.state === "idle" && (
                  <div className="text-zinc-500 dark:text-zinc-400">Idle</div>
                )}
                {statusTen.state === "loading" && (
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-amber-700 border-t-transparent dark:border-amber-300"></span>
                    <span>Generating 10...</span>
                  </div>
                )}
                {statusTen.state === "done" && (
                  <div className="text-emerald-700 dark:text-emerald-300">
                    Complete ({statusTen.created ?? 0} created
                    {typeof statusTen.errors === "number" && statusTen.errors > 0
                      ? `, ${statusTen.errors} errors`
                      : ""}
                    )
                  </div>
                )}
                {statusTen.state === "error" && (
                  <div className="text-red-600 dark:text-red-400">
                    {statusTen.message ?? "Error"}
                  </div>
                )}
              </div>
              <div className="rounded-lg border border-zinc-200 bg-white/80 p-2 text-xs dark:border-zinc-800 dark:bg-zinc-900/70">
                <div className="font-semibold text-zinc-700 dark:text-zinc-200">
                  All
                </div>
                {statusAll.state === "idle" && (
                  <div className="text-zinc-500 dark:text-zinc-400">Idle</div>
                )}
                {statusAll.state === "loading" && (
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-emerald-700 border-t-transparent dark:border-emerald-300"></span>
                    <span>Generating all...</span>
                  </div>
                )}
                {statusAll.state === "done" && (
                  <div className="text-emerald-700 dark:text-emerald-300">
                    Complete ({statusAll.created ?? 0} created
                    {typeof statusAll.errors === "number" && statusAll.errors > 0
                      ? `, ${statusAll.errors} errors`
                      : ""}
                    )
                  </div>
                )}
                {statusAll.state === "error" && (
                  <div className="text-red-600 dark:text-red-400">
                    {statusAll.message ?? "Error"}
                  </div>
                )}
              </div>
            </div>

            {lastPreview && (
              <div className="mt-4 rounded-xl border border-zinc-200 bg-white/80 p-3 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Last preview
                    </div>
                    <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      {lastPreview.fullName}
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      {lastPreview.certificateNumber}
                    </div>
                  </div>
                  <a
                    className="rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
                    href={lastPreview.imageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open image
                  </a>
                </div>
                <div className="mt-2 overflow-hidden rounded-lg border border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                  <Image
                    src={lastPreview.imageUrl}
                    alt="Generated preview"
                    width={2000}
                    height={1414}
                    unoptimized
                    className="w-full max-h-80 object-contain"
                  />
                </div>
              </div>
            )}
          </Section>
        </div>

        <div className="w-full px-6 py-8 border-y border-zinc-200 bg-zinc-100/30 dark:border-zinc-800 dark:bg-zinc-900/20">
          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Send Emails">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Send only certificates generated in the current batch. Set the subject and message for this bootcamp before sending.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Email Subject
                  </label>
                  <input
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-2 ring-transparent focus:ring-zinc-300 dark:border-zinc-800 dark:bg-zinc-900"
                    value={customSubject}
                    maxLength={200}
                    onChange={(e) => setCustomSubject(e.target.value)}
                    placeholder={`Your certificate from ${issuerName}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Custom Message
                  </label>
                  <textarea
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-2 ring-transparent focus:ring-zinc-300 dark:border-zinc-800 dark:bg-zinc-900"
                    rows={4}
                    maxLength={5000}
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    placeholder="Enter a message for this bootcamp..."
                  />
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Generated certificates queued: {generatedCertificateIds.length}. Successful or skipped sends are removed; failed sends remain available to retry.
                </p>
                {generatedCertificateIds.length > 0 && (
                  <button
                    className="w-full rounded-lg border border-amber-300 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-800 dark:text-amber-100 dark:hover:bg-amber-950"
                    disabled={emailStatus.state === "loading"}
                    onClick={() => {
                      const confirmed = window.confirm(
                        "Remove these certificate IDs from this browser's email queue? This does not delete the saved certificate records, and they will not be included in later batches."
                      );
                      if (!confirmed) return;
                      saveGeneratedCertificateIds([]);
                      setEmailStatus({ state: "idle" });
                      setLog((entries) => [
                        ...entries,
                        "Queued certificate IDs cleared; saved certificate records remain in the database.",
                      ]);
                    }}
                  >
                    Remove queued certificates (keeps saved records)
                  </button>
                )}
                <button
                  className="w-full inline-flex items-center justify-center rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-700"
                  onClick={sendEmails}
                  disabled={!canIssueCertificates || emailStatus.state === "loading" || generatedCertificateIds.length === 0}
                >
                  {emailStatus.state === "loading" ? (
                    <>
                      <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                      Sending...
                    </>
                  ) : (
                    "📧 Send Emails for This Batch"
                  )}
                </button>
                <div className="rounded-lg border border-zinc-200 bg-white/80 p-2 text-xs dark:border-zinc-800 dark:bg-zinc-900/70">
                  <div className="font-semibold text-zinc-700 dark:text-zinc-200">
                    Email Status
                  </div>
                  {emailStatus.state === "idle" && (
                    <div className="text-zinc-500 dark:text-zinc-400">Ready to send</div>
                  )}
                  {emailStatus.state === "loading" && (
                    <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300">
                      <span>Sending in progress...</span>
                    </div>
                  )}
                  {emailStatus.state === "done" && (
                    <div className="text-emerald-700 dark:text-emerald-300">
                      ✅ Sent: {emailStatus.sent || 0} | Failed: {emailStatus.failed || 0}
                    </div>
                  )}
                  {emailStatus.state === "error" && (
                    <div className="text-red-600 dark:text-red-400">
                      {emailStatus.message || "Error"}
                    </div>
                  )}
                </div>
              </div>
            </Section>

            <Section title="Email Logs">
              <div className="flex flex-col h-full">
                <div className="mb-4 flex flex-wrap gap-2">
                  {(["all", "sent", "skipped", "failed"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setEmailFilter(f)}
                      className={`rounded-md px-3 py-1 text-xs font-medium transition ${emailFilter === f
                        ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                        }`}
                    >
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>

                <div className="flex-1 rounded-lg border border-zinc-200 bg-white/80 dark:border-zinc-800 dark:bg-zinc-900/70">
                  {emailLogs.length === 0 ? (
                    <div className="flex h-40 items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
                      No logs yet. Send emails to see results.
                    </div>
                  ) : (
                    <div className="max-h-[300px] overflow-auto p-2 space-y-2">
                      {filteredEmailLogs.map((log, idx) => (
                          <div
                            key={idx}
                            className={`flex items-start justify-between rounded-lg border px-3 py-2 text-xs ${log.status === "sent"
                              ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950"
                              : log.status === "skipped"
                                ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950"
                                : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950"
                              }`}
                          >
                            <div className="flex-1">
                              <div className="font-medium text-zinc-900 dark:text-zinc-100">
                                {log.fullName}
                              </div>
                              {log.email && (
                                <div className="text-zinc-600 dark:text-zinc-400">
                                  {log.email}
                                </div>
                              )}
                              {(log.reason || log.error) && (
                                <div className="mt-1 text-zinc-400 dark:text-zinc-500 italic">
                                  {log.reason || log.error}
                                </div>
                              )}
                            </div>
                            <div
                              className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${log.status === "sent"
                                ? "bg-emerald-600 text-white"
                                : log.status === "skipped"
                                  ? "bg-amber-600 text-white"
                                  : "bg-red-600 text-white"
                                }`}
                            >
                              {log.status.toUpperCase()}
                            </div>
                          </div>
                        ))}
                      {filteredEmailLogs.length === 0 && (
                        <div className="py-8 text-center text-zinc-500 dark:text-zinc-400">
                          No {emailFilter} logs found.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Section>
          </div>
        </div>

        <div className="w-full px-6 py-8">
          <Section title="Activity">
            <div className=" rounded-xl border border-zinc-200 bg-white/70 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
              <div className="max-h-80 overflow-auto">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {log.length === 0 && (
                    <div className="text-sm text-zinc-500 dark:text-zinc-400">
                      No activity yet.
                    </div>
                  )}
                  {log.map((entry, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 rounded-lg border border-zinc-100 bg-white px-3 py-2 text-sm shadow-[0_1px_1px_rgba(0,0,0,0.04)] dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <span className="mt-0.5 h-2 w-2 rounded-full bg-emerald-500" />
                      <span className="text-zinc-800 dark:text-zinc-100">
                        {entry}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
