import { useState, useCallback, useRef, useEffect } from "react";

export function useCooldown({ duration }: { duration: number }) {
  const [remaining, setRemaining] = useState(0);
  const start = useCallback(() => setRemaining(duration), [duration]);
  const reset = useCallback(() => setRemaining(0), []);
  const endRef = useRef(0);

  useEffect(() => {
    if (remaining <= 0) return;
    endRef.current = Date.now() + remaining * 1000;
    const id = setInterval(() => {
      const left = Math.max(0, Math.round((endRef.current - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) clearInterval(id);
    }, 200);
    return () => clearInterval(id);
  }, [remaining]);

  return { remaining, isActive: remaining > 0, start, reset };
}
