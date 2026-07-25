import { apiRequest } from "./client";

export interface OnboardingStep {
  id: string;
  label: string;
  description: string;
  completed: boolean;
  order: number;
}

export interface OnboardingStatus {
  organizationId: string;
  completed: boolean;
  completedCount: number;
  totalSteps: number;
  steps: OnboardingStep[];
}

/**
 * Fetch current onboarding progress from the backend.
 * The backend computes step completion from existing data (no dedicated table).
 */
export function getOnboardingStatus(): Promise<OnboardingStatus> {
  return apiRequest<OnboardingStatus>("/api/onboarding/status");
}

/**
 * Generates sample/demo data for training-mode onboarding.
 * Creates products, parties, and a sample transaction so the user can
 * explore the app without entering everything manually.
 */
export function generateSampleData(): Promise<{ success: boolean; message: string }> {
  return apiRequest("/api/onboarding/sample-data", { method: "POST" });
}

/**
 * Removes all sample/demo data that was generated during onboarding.
 */
export function removeSampleData(): Promise<{ success: boolean; removed: number }> {
  return apiRequest("/api/onboarding/remove-sample-data", { method: "POST" });
}
