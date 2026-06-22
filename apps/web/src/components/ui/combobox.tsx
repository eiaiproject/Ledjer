import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Field } from "./field";

interface ComboboxProps {
  id?: string;
  name?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; secondaryLabel?: string }[];
  placeholder?: string;
  helperText?: string;
  error?: string;
  allowCreate?: boolean;
  onCreate?: (input: string) => void;
  loading?: boolean;
  emptyText?: string;
}

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
  const feedbackId = `${inputId}-feedback`;
  const describedBy = error || helperText ? feedbackId : undefined;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  // Find selected option from current value
  const selectedOption = useMemo(() => options.find((option) => option.value === value), [options, value]);

  // Derived display value: show query when editing, otherwise show selected label or raw value
  const displayValue = isEditing ? query : selectedOption?.label || value;

  // Close on outside click (using mousedown timing)
  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      // Check if click is inside wrapper
      if (wrapperRef.current?.contains(event.target as Node)) {
        return;
      }
      setOpen(false);
      setIsEditing(false);
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  // Filter options based on query
  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => {
      const haystack = `${option.label} ${option.secondaryLabel ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [query, options]);

  const canCreate = Boolean(
    allowCreate &&
      query.trim() &&
      !filteredOptions.some((option) => option.label.toLowerCase() === query.trim().toLowerCase())
  );
  const itemCount = filteredOptions.length + (canCreate ? 1 : 0);
  const activeDescendant = open && itemCount > 0 ? `${inputId}-option-${activeIndex}` : undefined;

  // Select an option
  const selectOption = useCallback(
    (option: { value: string; label: string }) => {
      // Set form value
      onChange(option.value);
      setQuery("");
      setIsEditing(false);
      setOpen(false);
      setActiveIndex(0);
      // Focus input after selection
      inputRef.current?.focus();
    },
    [onChange]
  );

  // Create a new option
  const createOption = useCallback(() => {
    const nextValue = query.trim();
    if (!nextValue) return;
    onCreate?.(nextValue);
    onChange(nextValue);
    setQuery("");
    setIsEditing(false);
      setOpen(false);
    setActiveIndex(0);
  }, [query, onCreate, onChange]);

  return (
    <Field label={label} error={error} helperText={helperText} htmlFor={inputId} feedbackId={feedbackId}>
      <div ref={wrapperRef} className="relative">
        <input
          ref={inputRef}
          id={inputId}
          name={name}
          role="combobox"
          aria-controls={`${inputId}-listbox`}
          aria-expanded={open}
          aria-activedescendant={activeDescendant}
          aria-autocomplete="list"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          value={displayValue}
          placeholder={placeholder}
          onFocus={() => {
            setQuery("");
            setIsEditing(true);
            setOpen(true);
            setActiveIndex(0);
          }}
          onChange={(event) => {
            const nextValue = event.target.value;
            setQuery(nextValue);
            setIsEditing(true);
            if (allowCreate) {
              onChange(nextValue);
            } else if (value) {
              onChange("");
            }
            setOpen(true);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              if (!open) {
                setOpen(true);
                setActiveIndex(0);
              } else {
                setActiveIndex((index) => (itemCount === 0 ? 0 : (index + 1) % itemCount));
              }
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              if (!open) {
                setOpen(true);
                setActiveIndex(itemCount > 0 ? itemCount - 1 : 0);
              } else {
                setActiveIndex((index) => (itemCount === 0 ? 0 : (index - 1 + itemCount) % itemCount));
              }
            } else if (event.key === "Enter" && open) {
              event.preventDefault();
              if (activeIndex < filteredOptions.length) {
                selectOption(filteredOptions[activeIndex]);
              } else if (canCreate) {
                createOption();
              }
            } else if (event.key === "Escape") {
              setOpen(false);
              setIsEditing(false);
            }
          }}
          className={cn(
            "min-h-[44px] h-10 w-full min-w-0 rounded-md border bg-cream-50 px-3 pr-10 text-sm text-wood-900",
            "placeholder:text-text-muted",
            "transition-[background-color,border-color,box-shadow] duration-150 ease-out focus-visible:bg-surface-elevated",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wood-500",
            error ? "border-error" : "border-wood-200",
            "sm:min-h-0"
          )}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center text-wood-400">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}
        </span>
        {open && (
          <div
            ref={listboxRef}
            id={`${inputId}-listbox`}
            role="listbox"
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border border-wood-200 bg-surface-elevated py-1 shadow-lg"
          >
            {filteredOptions.map((option, index) => (
              <button
                key={option.value}
                id={`${inputId}-option-${index}`}
                role="option"
                type="button"
                aria-selected={option.value === value}
                onMouseDown={(event) => {
                  // Prevent input blur before click handler runs
                  event.preventDefault();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  selectOption(option);
                }}
                className={cn(
                  "flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left text-wood-800 transition-colors hover:bg-cream-100",
                  activeIndex === index && "bg-cream-100"
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block break-words">{option.label}</span>
                  {option.secondaryLabel && (
                    <span className="block break-words text-xs text-text-tertiary">{option.secondaryLabel}</span>
                  )}
                </span>
                {option.value === value && <Check className="h-4 w-4 shrink-0 text-success" />}
              </button>
            ))}
            {canCreate && (
              <button
                id={`${inputId}-option-${filteredOptions.length}`}
                role="option"
                type="button"
                aria-selected={false}
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation();
                  createOption();
                }}
                className={cn(
                  "flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left text-wood-800 transition-colors hover:bg-cream-100",
                  activeIndex === filteredOptions.length && "bg-cream-100"
                )}
              >
                <Plus className="h-4 w-4 shrink-0 text-wood-500" />
                <span className="min-w-0 break-words">Buat &quot;{query.trim()}&quot;</span>
              </button>
            )}
            {!loading && filteredOptions.length === 0 && !canCreate && (
              <div className="px-3 py-2 text-sm text-text-tertiary">{emptyText}</div>
            )}
          </div>
        )}
      </div>
    </Field>
  );
}
