import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-[12px] border border-transparent text-[13px] font-semibold whitespace-nowrap transition-all duration-150 outline-none select-none focus-visible:ring-2 focus-visible:ring-[#007BFF]/45 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[15px] gap-2 cursor-pointer",
  {
    variants: {
      variant: {
        default: "glass-btn-primary text-white",
        outline:
          "glass-btn-secondary text-[#101D36] dark:text-foreground",
        secondary:
          "bg-[#E6F0FD]/90 dark:bg-secondary text-[#101D36] dark:text-secondary-foreground hover:bg-[#DCEAFE] dark:hover:bg-slate-800 shadow-[var(--glass-shadow-sm)] border border-[#CFE0F3] dark:border-border/60",
        ghost:
          "hover:bg-white/75 dark:hover:bg-white/[0.06] text-[#52657F] hover:text-[#0068F5] dark:hover:text-foreground aria-expanded:bg-white/80",
        destructive:
          "glass-btn-danger text-white",
        danger:
          "glass-btn-danger text-white",
        link: "text-[#007BFF] underline-offset-4 hover:underline",
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
