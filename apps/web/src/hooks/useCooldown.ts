import { useState, useEffect, useCallback } from "react";

export function useCooldown({ duration }: { duration: number }) {
  const [remaining, setRemaining] = useState(0);
  const start = useCallback(() => setRemaining(duration), [duration]);
  const reset = useCallback(() => setRemaining(0), []);

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setTimeout(() => setRemaining(remaining - 1), 1000);
    return () => clearTimeout(id);
  }, [remaining]);

  return { remaining, isActive: remaining > 0, start, reset };
}
