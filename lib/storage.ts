import path from "node:path";

export type StorageArea = "images" | "templates";

export function getStorageRoot(): string {
  return path.resolve(
    /* turbopackIgnore: true */
    process.env.CERTIFICATE_STORAGE_DIR?.trim() ||
      path.join(process.cwd(), "certificate-store")
  );
}

export function getStorageDirectory(area: StorageArea): string {
  return path.join(/* turbopackIgnore: true */ getStorageRoot(), area);
}

function isInsideDirectory(directory: string, candidate: string): boolean {
  const relative = path.relative(directory, candidate);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

export function resolveStoredFile(area: StorageArea, storedPath: string): string {
  const directory = path.resolve(getStorageDirectory(area));
  const candidate = path.resolve(
    path.isAbsolute(storedPath)
      ? storedPath
      : path.join(/* turbopackIgnore: true */ getStorageRoot(), storedPath)
  );
  if (!isInsideDirectory(directory, candidate)) {
    throw new Error("Stored file path is outside its configured storage area");
  }
  return candidate;
}

export function resolveGeneratedImage(fileName: string): string {
  if (!/^[a-zA-Z0-9-]{1,100}\.png$/.test(fileName)) {
    throw new Error("Invalid generated image name");
  }
  return resolveStoredFile("images", path.join("images", fileName));
}

export function resolveTemplateFile(fileName: string): string {
  if (!/^[a-zA-Z0-9._-]{1,180}\.png$/.test(fileName) || fileName.includes("..")) {
    throw new Error("Invalid template image name");
  }
  return resolveStoredFile("templates", path.join("templates", fileName));
}
