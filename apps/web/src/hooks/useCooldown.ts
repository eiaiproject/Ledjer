import { useCallback, useEffect, useRef, useState } from "react";

interface UseCooldownOptions {
  /** Cooldown duration in seconds */
  duration: number;
}

interface UseCooldownReturn {
  /** Current remaining seconds (0 when not active) */
  remaining: number;
  /** Whether cooldown is currently active */
  isActive: boolean;
  /** Start the cooldown timer */
  start: () => void;
  /** Reset the cooldown to 0 */
  reset: () => void;
}

/**
 * Reusable cooldown timer for resend buttons, rate limits, etc.
 * Used by login, register, and forgot-password pages.
 */
export function useCooldown({ duration }: UseCooldownOptions): UseCooldownReturn {
  const [remaining, setRemaining] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const start = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRemaining(duration);
    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [duration]);

  const reset = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setRemaining(0);
  }, []);

  return { remaining, isActive: remaining > 0, start, reset };
}
