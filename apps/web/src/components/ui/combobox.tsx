import { useId, useMemo, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Field } from "./field";

type ComboboxOption = Readonly<{
  value: string;
  label: string;
  secondaryLabel?: string;
}>;

type ComboboxProps = Readonly<{
  id?: string;
  name?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly ComboboxOption[];
  placeholder?: string;
  helperText?: string;
  error?: string;
  allowCreate?: boolean;
  onCreate?: (input: string) => void;
  loading?: boolean;
  emptyText?: string;
}>;

export function Combobox({
  id,
  name,
  label,
  value,
  onChange,
  options,
  placeholder,
  helperText,
  error,
  allowCreate,
  onCreate,
  loading,
  emptyText = "Tidak ada hasil",
}: ComboboxProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listId = `${inputId}-options`;
  const feedbackId = `${inputId}-feedback`;
  const describedBy = error || helperText ? feedbackId : undefined;

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );
  const selectedLabel = selectedOption?.label ?? value;
  const [draftValue, setDraftValue] = useState<string | null>(null);
  const inputValue = draftValue ?? selectedLabel;
  let placeholderText = placeholder;
  if (loading) {
    placeholderText = "Memuat...";
  } else if (options.length === 0) {
    placeholderText = emptyText;
  }

  const commit = (rawValue: string) => {
    const nextValue = rawValue.trim();
    const normalizedValue = nextValue.toLowerCase();
    const exactMatch = options.find(
      (option) =>
        option.value === nextValue ||
        option.label.toLowerCase() === normalizedValue,
    );
    const partialMatches = nextValue
      ? options.filter((option) => option.label.toLowerCase().includes(normalizedValue))
      : [];
    const match = exactMatch ?? (partialMatches.length === 1 ? partialMatches[0] : undefined);

    if (match) {
      onChange(match.value);
      setDraftValue(null);
      return;
    }

    if (allowCreate && nextValue) {
      onCreate?.(nextValue);
      onChange(nextValue);
      setDraftValue(null);
      return;
    }

    onChange("");
    setDraftValue(null);
  };

  return (
    <Field label={label} error={error} helperText={helperText} htmlFor={inputId} feedbackId={feedbackId}>
      <div className="relative">
        <input
          id={inputId}
          name={name}
          role="combobox"
          list={listId}
          aria-controls={listId}
          aria-expanded={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          value={inputValue}
          placeholder={placeholderText}
          disabled={loading}
          onChange={(event) => setDraftValue(event.target.value)}
          onBlur={(event) => commit(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit(event.currentTarget.value);
            }
          }}
          className={cn(
            "min-h-[44px] h-10 w-full min-w-0 rounded-md border bg-cream-50 px-3 pr-10 text-sm text-wood-900",
            "placeholder:text-text-muted",
            "transition-[background-color,border-color,box-shadow] duration-150 ease-out focus-visible:bg-surface-elevated",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wood-500",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error ? "border-error" : "border-wood-200",
            "sm:min-h-0",
          )}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center text-wood-400">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}
        </span>
        <datalist id={listId}>
          {options.map((option) => (
            <option key={option.value} value={option.label}>
              {option.secondaryLabel}
            </option>
          ))}
        </datalist>
      </div>
    </Field>
  );
}
