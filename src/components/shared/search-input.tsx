"use client";

import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface SearchInputProps {
  placeholder?: string;
  onSearch?: (query: string) => void;
  onChange?: (query: string) => void;
  value?: string;
  defaultValue?: string;
  className?: string;
  debounceMs?: number;
  minChars?: number;
}

export function SearchInput({
  placeholder = "Search...",
  onSearch,
  onChange,
  value: controlledValue,
  defaultValue = "",
  className,
  debounceMs = 280,
  minChars = 2,
}: SearchInputProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const value = controlledValue !== undefined ? controlledValue : internalValue;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    if (controlledValue === undefined) {
      setInternalValue(newValue);
    }
    if (onChange) {
      onChange(newValue);
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    const trimmed = newValue.trim();

    // If search is cleared (empty), immediately fire search without delay
    if (trimmed === "") {
      if (onSearch) {
        onSearch("");
      }
      return;
    }

    // If query meets minimum character threshold, debounce search
    if (trimmed.length >= minChars) {
      timerRef.current = setTimeout(() => {
        if (onSearch) {
          onSearch(trimmed);
        }
      }, debounceMs);
    }
  };

  const handleClear = () => {
    if (controlledValue === undefined) {
      setInternalValue("");
    }
    if (onChange) {
      onChange("");
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    if (onSearch) {
      onSearch("");
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <div className={`relative ${className || ""}`}>
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      <Input
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        className="pl-9 pr-8 text-xs font-medium"
      />
      {value && value.length > 0 && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded"
          title="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
