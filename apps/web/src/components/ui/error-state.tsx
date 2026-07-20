import { AlertTriangle } from "reicon-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";
import { translateError } from "@/lib/errors";

interface ErrorStateProps {
  readonly error?: unknown;
  readonly message?: string;
  readonly onRetry?: () => void;
  readonly className?: string;
}

export function ErrorState({ error, message, onRetry, className }: ErrorStateProps) {
  const displayMessage = message || translateError(error);

  return (
    <div className={cn("flex min-w-0 flex-col items-center justify-center px-4 py-12 text-center", className)} role="alert" aria-live="assertive">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-error/10 mb-4">
        <AlertTriangle className="h-8 w-8 text-error" />
      </div>
      <h3 className="max-w-full break-words text-lg font-semibold text-wood-800">Terjadi Kesalahan</h3>
      <p className="mt-1 max-w-sm break-words text-sm text-wood-500">{displayMessage}</p>
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
