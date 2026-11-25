import { TriangleExclamationPoint } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";
import { translateError } from "@/lib/errors";

type HeadingLevel = 2 | 3 | 4;

interface ErrorStateProps {
  readonly error?: unknown;
  readonly message?: string;
  readonly title?: string;
  readonly onRetry?: () => void;
  readonly className?: string;
  /** Keep the heading under its card heading (default 2 for top-level states). */
  readonly headingLevel?: HeadingLevel;
}

export function ErrorState({ error, message, title, onRetry, className, headingLevel = 2 }: ErrorStateProps) {
  const heading = title ?? "Terjadi Kesalahan";
  const displayMessage = message ?? (title ? undefined : translateError(error));
  const Heading = ({ 2: "h2", 3: "h3", 4: "h4" } as const)[headingLevel];

  return (
    <div className={cn("flex min-w-0 flex-col items-center justify-center px-4 py-12 text-center", className)} role="alert" aria-live="assertive">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-error/10 mb-4">
        <TriangleExclamationPoint className="h-8 w-8 text-error" />
      </div>
      <Heading className="max-w-full break-words text-lg font-semibold text-wood-800">{heading}</Heading>
      {displayMessage && (
        <p className="mt-1 max-w-sm break-words text-sm text-wood-500">{displayMessage}</p>
      )}
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
