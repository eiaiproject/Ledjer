// Slim admin API client. Intentionally NOT a copy of the web app's client:
// admin bundles its own error handling (no react-query, no toast dependency).
interface ApiErrorBody {
  error?: { code?: string; message?: string; requestId?: string };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

/**
 * Fetch wrapper for admin endpoints. On 401 the session is gone —
 * bounce back to the login screen (admin has no public pages).
 */
export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, credentials: "include", headers });

  if (response.status === 401) {
    window.location.href = "/login";
    throw new ApiError(401, "unauthorized", "Session expired");
  }

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

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
