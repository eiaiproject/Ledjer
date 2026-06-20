import { useEffect, useId, useMemo, useRef, useState } from "react";
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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const selectedOption = options.find((option) => option.value === value);
  const [inputValue, setInputValue] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const displayValue = isEditing ? inputValue : selectedOption?.label ?? value;

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setIsEditing(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const filteredOptions = useMemo(() => {
    const query = displayValue.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) => {
      const haystack = `${option.label} ${option.secondaryLabel ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [displayValue, options]);

  const canCreate = Boolean(allowCreate && displayValue.trim() && !filteredOptions.some((option) => option.label.toLowerCase() === displayValue.trim().toLowerCase()));
  const itemCount = filteredOptions.length + (canCreate ? 1 : 0);
  const activeDescendant = open && itemCount > 0 ? `${inputId}-option-${activeIndex}` : undefined;

  const selectOption = (option: { value: string; label: string }) => {
    onChange(option.value);
    setInputValue(option.label);
    setIsEditing(false);
    setOpen(false);
  };

  const createOption = () => {
    const nextValue = displayValue.trim();
    if (!nextValue) return;
    onCreate?.(nextValue);
    onChange(nextValue);
    setInputValue(nextValue);
    setIsEditing(false);
    setOpen(false);
  };

  return (
    <Field label={label} error={error} helperText={helperText} htmlFor={inputId}>
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
          value={displayValue}
          placeholder={placeholder}
          onFocus={() => {
            setInputValue(selectedOption?.label ?? value);
            setIsEditing(true);
            setOpen(true);
          }}
          onChange={(event) => {
            const nextValue = event.target.value;
            setInputValue(nextValue);
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
              setOpen(true);
              setActiveIndex((index) => (itemCount === 0 ? 0 : (index + 1) % itemCount));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) => (itemCount === 0 ? 0 : (index - 1 + itemCount) % itemCount));
            } else if (event.key === "Enter" && open) {
              event.preventDefault();
              if (activeIndex < filteredOptions.length) {
                selectOption(filteredOptions[activeIndex]);
              } else if (canCreate) {
                createOption();
              }
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          className={cn(
            "h-10 w-full rounded-md border bg-cream-50 px-3 pr-10 text-sm text-wood-900",
            "placeholder:text-text-muted",
            "focus:outline-none focus:ring-2 focus:ring-wood-500 focus:border-wood-500",
            error ? "border-error" : "border-wood-200"
          )}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center text-wood-400">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}
        </span>
        {open && (
          <div
            id={`${inputId}-listbox`}
            role="listbox"
            className="absolute z-dropdown mt-1 max-h-64 w-full overflow-auto rounded-md border border-wood-200 bg-surface-elevated py-1 text-sm shadow-lg"
          >
            {filteredOptions.map((option, index) => (
              <button
                key={option.value}
                id={`${inputId}-option-${index}`}
                role="option"
                type="button"
                aria-selected={option.value === value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectOption(option)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-wood-800 hover:bg-cream-100",
                  activeIndex === index && "bg-cream-100"
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{option.label}</span>
                  {option.secondaryLabel && <span className="block truncate text-xs text-text-tertiary">{option.secondaryLabel}</span>}
                </span>
                {option.value === value && <Check className="h-4 w-4 text-success" />}
              </button>
            ))}
            {canCreate && (
              <button
                id={`${inputId}-option-${filteredOptions.length}`}
                role="option"
                type="button"
                aria-selected={false}
                onMouseDown={(event) => event.preventDefault()}
                onClick={createOption}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-wood-800 hover:bg-cream-100",
                activeIndex === filteredOptions.length && "bg-cream-100"
              )}
            >
              <Plus className="h-4 w-4 text-wood-500" />
                Buat "{displayValue.trim()}"
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
