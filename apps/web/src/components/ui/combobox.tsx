import { useId, useMemo, useRef, useState, useEffect, useCallback } from "react";
import { ChevronDown, Check, Loader } from "reicon-react";
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
  const listboxId = `${inputId}-listbox`;
  const feedbackId = `${inputId}-feedback`;
  const describedBy = error || helperText ? feedbackId : undefined;

  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLLIElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );

  const filteredOptions = useMemo(() => {
    if (!query) return options;
    const q = query.toLowerCase();
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(q) ||
        option.value.toLowerCase().includes(q),
    );
  }, [options, query]);

  const showCreateOption =
    allowCreate &&
    query.trim() &&
    !options.some((o) => o.label.toLowerCase() === query.toLowerCase());

  const displayValue = open ? query : (selectedOption?.label ?? "");

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && activeItemRef.current) {
      activeItemRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  const selectOption = useCallback(
    (optionValue: string) => {
      onChange(optionValue);
      setQuery("");
      setOpen(false);
      setActiveIndex(-1);
      inputRef.current?.blur();
    },
    [onChange],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setActiveIndex(-1);
    if (!open) setOpen(true);
  };

  const handleInputFocus = () => {
    setOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const totalItems = filteredOptions.length + (showCreateOption ? 1 : 0);

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % totalItems);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) => (prev <= 0 ? totalItems - 1 : prev - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < filteredOptions.length) {
          selectOption(filteredOptions[activeIndex].value);
        } else if (showCreateOption && activeIndex === filteredOptions.length) {
          onCreate?.(query.trim());
          onChange(query.trim());
          setQuery("");
          setOpen(false);
        }
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        setQuery("");
        inputRef.current?.blur();
        break;
      case "Tab":
        setOpen(false);
        setQuery("");
        break;
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // Don't close if focus moves to the listbox
    if (containerRef.current?.contains(e.relatedTarget as Node)) return;
    setOpen(false);
    setQuery("");
  };

  let placeholderText = placeholder;
  if (loading) placeholderText = "Memuat...";
  else if (options.length === 0) placeholderText = emptyText;

  return (
    <Field label={label} error={error} helperText={helperText} htmlFor={inputId} feedbackId={feedbackId}>
      <div ref={containerRef} className="relative z-10">
        <input
          ref={inputRef}
          id={inputId}
          name={name}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={activeIndex >= 0 ? `${inputId}-option-${activeIndex}` : undefined}
          aria-autocomplete="list"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          value={displayValue}
          placeholder={placeholderText}
          disabled={loading}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
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
          {loading ? <Loader className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}
        </span>

        {/* Dropdown */}
        {open && !loading && (
          <ul
            ref={listboxRef}
            id={listboxId}
            role="listbox"
            tabIndex={-1}
            className={cn(
              "absolute z-dropdown mt-1 max-h-60 w-full overflow-auto rounded-lg border border-wood-200 bg-surface-elevated py-1 shadow-lg",
              "animate-in fade-in-0 zoom-in-95",
            )}
          >
            {filteredOptions.length === 0 && !showCreateOption && (
              <li className="px-3 py-2.5 text-sm text-wood-500">{emptyText}</li>
            )}
            {filteredOptions.map((option, index) => {
              const isSelected = option.value === value;
              const isActive = index === activeIndex;
              return (
                <li
                  key={option.value}
                  id={`${inputId}-option-${index}`}
                  ref={isActive ? activeItemRef : undefined}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectOption(option.value);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm",
                    isActive && "bg-wood-100",
                    isSelected && "font-medium text-wood-900",
                    !isSelected && "text-wood-700",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {option.label}
                    {option.secondaryLabel && (
                      <span className="ml-2 text-xs text-wood-400">{option.secondaryLabel}</span>
                    )}
                  </span>
                  {isSelected && <Check className="h-4 w-4 shrink-0 text-wood-600" />}
                </li>
              );
            })}
            {showCreateOption && (
              <li
                id={`${inputId}-option-${filteredOptions.length}`}
                ref={activeIndex === filteredOptions.length ? activeItemRef : undefined}
                role="option"
                aria-selected={false}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onCreate?.(query.trim());
                  onChange(query.trim());
                  setQuery("");
                  setOpen(false);
                }}
                onMouseEnter={() => setActiveIndex(filteredOptions.length)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 border-t border-wood-100 px-3 py-2.5 text-sm",
                  activeIndex === filteredOptions.length && "bg-wood-100",
                  "text-wood-600 italic",
                )}
              >
                Buat &quot;{query.trim()}&quot;
              </li>
            )}
          </ul>
        )}
      </div>
    </Field>
  );
}
