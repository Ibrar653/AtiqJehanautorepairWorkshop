"use client";

import * as React from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "checked" | "onChange"> {
  checked?: boolean | "indeterminate";
  onCheckedChange?: (checked: boolean) => void;
}

export const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  (
    {
      className,
      checked = false,
      onCheckedChange,
      disabled,
      "aria-label": ariaLabel,
      id,
      ...props
    },
    ref
  ) => {
    const isChecked = checked === true;
    const isIndeterminate = checked === "indeterminate";

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (disabled) return;
      if (onCheckedChange) {
        onCheckedChange(!isChecked);
      }
    };

    return (
      <button
        type="button"
        role="checkbox"
        id={id}
        ref={ref}
        aria-checked={isIndeterminate ? "mixed" : isChecked}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={handleClick}
        className={cn(
          "peer h-4 w-4 shrink-0 rounded border transition-all duration-150 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40 select-none",
          isChecked || isIndeterminate
            ? "bg-blue-600 border-blue-600 text-white shadow-xs"
            : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-400 dark:hover:border-slate-600",
          className
        )}
        {...props}
      >
        {isChecked && <Check className="h-3 w-3 stroke-[3]" />}
        {isIndeterminate && <Minus className="h-3 w-3 stroke-[3]" />}
      </button>
    );
  }
);

Checkbox.displayName = "Checkbox";
