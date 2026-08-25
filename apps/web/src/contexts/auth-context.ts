import { createContext, useContext } from "react";
import type { AuthSession, AuthUser } from "@/lib/api/auth";

export interface SignUpResult {
  session: AuthSession | null;
  user: AuthUser | null;
  needsEmailConfirmation: boolean;
}

export interface AuthContextType {
  readonly session: AuthSession | null;
  readonly user: AuthUser | null;
  readonly loading: boolean;
  readonly error: Error | null;
  readonly signIn: (email: string, password: string) => Promise<void>;
  readonly signUp: (email: string, password: string, fullName: string, redirectTo?: string) => Promise<SignUpResult>;
  readonly resendConfirmationEmail: (email: string) => Promise<void>;
  readonly signOut: () => Promise<void>;
  readonly refreshSession: () => Promise<void>;
}

// ponytail: defaults are never reachable - Provider always wraps consumers.
export const AuthContext = createContext<AuthContextType>(null!);

export function useAuth() {
  return useContext(AuthContext);
}
