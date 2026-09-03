import { apiRequest } from "./client";

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
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
  organization: {
    id: string;
    name: string;
  };
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
  organizationName: string,
): Promise<RegisterResponse> {
  return apiRequest<RegisterResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, fullName, organizationName }),
  });
}

export function logout(): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>("/api/auth/logout", { method: "POST" });
}