import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent text-[13px] font-semibold whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[15px] gap-2",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-[#1D4ED8] active:bg-[#1E40AF] shadow-xs",
        outline:
          "border-border bg-card text-foreground hover:bg-slate-50 dark:hover:bg-muted/50 hover:text-foreground shadow-xs border",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-slate-200/80 dark:hover:bg-slate-800 shadow-xs border border-border/60",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-red-700 active:bg-red-800 shadow-xs",
        danger:
          "bg-destructive text-destructive-foreground hover:bg-red-700 active:bg-red-800 shadow-xs",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-[38px] px-3.5 gap-2",
        sm: "h-8 px-2.5 gap-1.5 text-xs font-medium",
        xs: "h-6 px-2 gap-1 text-[11px] rounded-md [&_svg:not([class*='size-'])]:size-3 font-medium",
        lg: "h-11 px-5 gap-2 text-sm",
        icon: "size-[38px]",
        "icon-sm": "size-8",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  nativeButton,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      nativeButton={nativeButton !== undefined ? nativeButton : (props.render ? false : undefined)}
      {...props}
    />
  )
}

export { Button, buttonVariants }
