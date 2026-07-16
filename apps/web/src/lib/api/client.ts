export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    requestId?: string;
  };
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

import { queryClient } from "../query-client";
import { toast } from "@/components/ui/toast";

let isRedirectingToLogin = false;

/**
 * Paths where a 401 should NOT redirect to login (e.g., auth pages).
 */
const PUBLIC_AUTH_PATHS = new Set([
  "/login", "/register", "/forgot-password", "/reset-password",
  "/auth/callback", "/invitations/accept",
]);

function handleUnauthorized(): void {
  if (isRedirectingToLogin) return;
  if (PUBLIC_AUTH_PATHS.has(window.location.pathname)) return;

  isRedirectingToLogin = true;
  queryClient.clear();
  toast.error("Sesi Anda telah berakhir. Silakan masuk kembali.");

  const from = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `/login?from=${from}`;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });

  if (!response.ok) {
    if (response.status === 401) {
      handleUnauthorized();
    }

    let body: ApiErrorBody | undefined;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      body = undefined;
    }
    throw new ApiError(
      response.status,
      body?.error?.code ?? "request_failed",
      body?.error?.message ?? "Request failed",
      body?.error?.requestId,
    );
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function apiDownload(
  path: string,
  init: RequestInit = {},
): Promise<{ blob: Blob; filename?: string }> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
  });

  if (!response.ok) {
    let body: ApiErrorBody | undefined;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      body = undefined;
    }
    throw new ApiError(
      response.status,
      body?.error?.code ?? "request_failed",
      body?.error?.message ?? "Request failed",
      body?.error?.requestId,
    );
  }

  return {
    blob: await response.blob(),
    filename: filenameFromContentDisposition(response.headers.get("Content-Disposition")),
  };
}

function filenameFromContentDisposition(value: string | null): string | undefined {
  if (!value) return undefined;
  const match = /filename="([^"]+)"/i.exec(value) || /filename=([^;]+)/i.exec(value);
  return match?.[1]?.trim();
}
