import { createContext, useContext } from "react";
import type { Session, User } from "@supabase/supabase-js";

export interface SignUpResult {
  session: Session | null;
  user: User | null;
  needsEmailConfirmation: boolean;
}

export interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string, redirectTo?: string) => Promise<SignUpResult>;
  resendConfirmationEmail: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signIn: async () => {},
  signUp: async () => ({ session: null, user: null, needsEmailConfirmation: false }),
  resendConfirmationEmail: async () => {},
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}
