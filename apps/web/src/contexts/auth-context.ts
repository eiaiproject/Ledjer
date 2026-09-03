import { createContext, useContext } from "react";
import type { AuthSession, AuthUser } from "@/lib/api/auth";

export interface AuthContextType {
  readonly session: AuthSession | null;
  readonly user: AuthUser | null;
  readonly loading: boolean;
  readonly error: Error | null;
  readonly signIn: (email: string, password: string) => Promise<void>;
  readonly signUp: (email: string, password: string, fullName: string, organizationName: string) => Promise<void>;
  readonly signOut: () => Promise<void>;
  readonly refreshSession: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>(null!);

export function useAuth() {
  return useContext(AuthContext);
}