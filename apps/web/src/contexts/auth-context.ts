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

export const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  error: null,
  signIn: async () => {},
  signUp: async () => ({ session: null, user: null, needsEmailConfirmation: false }),
  resendConfirmationEmail: async () => {},
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}
