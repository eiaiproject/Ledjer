import { createContext, useContext } from "react";
import type { AuthSession, AuthUser } from "@/lib/api/auth";

export interface SignUpResult {
  session: AuthSession | null;
  user: AuthUser | null;
  needsEmailConfirmation: boolean;
}

export interface AuthContextType {
  session: AuthSession | null;
  user: AuthUser | null;
  loading: boolean;
  error: Error | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string, redirectTo?: string) => Promise<SignUpResult>;
  resendConfirmationEmail: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

// ponytail: defaults are never reachable — Provider always wraps consumers.
export const AuthContext = createContext<AuthContextType>(null!);

export function useAuth() {
  return useContext(AuthContext);
}
