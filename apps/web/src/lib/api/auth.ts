import { apiRequest } from "./client";

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  business_name: string;
}

export interface AuthSession {
  id: string;
  user_id: string;
  expires_at: number;
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
    businessName: string;
  };
}

export interface UpdateProfileResponse {
  businessName: string;
}

export function updateBusinessName(businessName: string): Promise<UpdateProfileResponse> {
  return apiRequest<UpdateProfileResponse>("/api/auth/me", {
    method: "PATCH",
    body: JSON.stringify({ businessName }),
  });
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
  businessName: string,
): Promise<RegisterResponse> {
  return apiRequest<RegisterResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, fullName, businessName }),
  });
}

export function logout(): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>("/api/auth/logout", { method: "POST" });
}

export interface GoogleStartResponse {
  url: string;
}

export function startGoogleAuth(): Promise<GoogleStartResponse> {
  return apiRequest<GoogleStartResponse>("/api/auth/google/start");
}