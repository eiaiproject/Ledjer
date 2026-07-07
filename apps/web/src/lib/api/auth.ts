import { apiRequest } from "./client";

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  email_verified_at: number | null;
}

export interface AuthSession {
  id: string;
  user_id: string;
  expires_at: number;
  current_organization_id: string | null;
}

export interface AuthMeResponse {
  user: AuthUser | null;
  session: AuthSession | null;
}

export interface RegisterResponse {
  user: {
    id: string;
    email: string;
    fullName: string;
  };
  session: AuthSession | null;
  needsEmailConfirmation: boolean;
}

export interface GoogleStartResponse {
  url?: string;
}

export function getMe(): Promise<AuthMeResponse> {
  return apiRequest<AuthMeResponse>("/api/auth/me");
}

export function login(email: string, password: string): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function register(
  email: string,
  password: string,
  fullName: string,
): Promise<RegisterResponse> {
  return apiRequest<RegisterResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, fullName }),
  });
}

export function logout(): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>("/api/auth/logout", { method: "POST" });
}

export function verifyEmail(
  token: string,
  type: "signup" | "recovery" = "signup",
): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>("/api/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token, type }),
  });
}

export function resendVerification(email: string): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>("/api/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ email, type: "signup" }),
  });
}

export function forgotPassword(email: string): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(password: string): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export function startGoogleAuth(): Promise<GoogleStartResponse> {
  return apiRequest<GoogleStartResponse>("/api/auth/google/start");
}
