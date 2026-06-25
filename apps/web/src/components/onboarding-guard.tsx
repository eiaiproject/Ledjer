import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useOrganization } from "@/hooks/useOrganization";

/**
 * Redirects away from /onboarding if the organization has already completed
 * onboarding. Prevents users from re-running setup after completion.
 */
export function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { data: orgData, isLoading } = useOrganization();

  useEffect(() => {
    if (!isLoading && orgData && !orgData.needsOnboarding) {
      navigate("/dashboard", { replace: true });
    }
  }, [orgData, isLoading, navigate]);

  if (isLoading || (orgData && orgData.needsOnboarding === false)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
