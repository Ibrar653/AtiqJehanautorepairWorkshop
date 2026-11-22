import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-[11px] border border-[#D6E2F0] dark:border-input bg-[#FFFFFF] dark:bg-[#0E172A] px-3.5 py-2.5 text-[13.5px] text-foreground shadow-[var(--neu-shadow-inset)] transition-all outline-none placeholder:text-muted-foreground focus-visible:border-[#007BFF] focus-visible:ring-2 focus-visible:ring-[#007BFF]/20 disabled:cursor-not-allowed disabled:bg-muted/40 disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
