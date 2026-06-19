import { AlertTriangle } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";
import { translateError } from "@/lib/errors";

interface ErrorStateProps {
  error?: unknown;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ error, message, onRetry, className }: ErrorStateProps) {
  const displayMessage = message || translateError(error);

  return (
    <div className={cn("flex flex-col items-center justify-center py-12 px-4 text-center", className)}>
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-error/10 mb-4">
        <AlertTriangle className="h-8 w-8 text-error" />
      </div>
      <h3 className="text-lg font-semibold text-wood-800">Terjadi Kesalahan</h3>
      <p className="mt-1 text-sm text-wood-500 max-w-sm">{displayMessage}</p>
      {onRetry && (
        <div className="mt-4">
          <Button variant="outline" onClick={onRetry}>
            Coba Lagi
          </Button>
        </div>
      )}
    </div>
  );
}
