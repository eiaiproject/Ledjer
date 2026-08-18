import { apiDownload } from "@/lib/api/client";

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function todayFilename(prefix: string, extension: string): string {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${prefix}_${yyyy}${mm}${dd}.${extension}`;
}

function withQuery(path: string, query: string): string {
  return query ? `${path}?${query}` : path;
}

/** Download an API export (CSV/PDF) with a fallback filename for the current date. */
export async function downloadExport(
  path: string,
  fallbackPrefix: string,
  extension: "csv" | "pdf",
): Promise<void> {
  const { blob, filename } = await apiDownload(path);
  downloadBlob(blob, filename || todayFilename(fallbackPrefix, extension));
}

/** Build an API export path with an optional query string. */
export function exportPath(path: string, params: URLSearchParams): string {
  return withQuery(path, params.toString());
}
