"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface GenerateAIButtonProps {
  className?: string;
}

export function GenerateAIButton({ className }: GenerateAIButtonProps) {
  const pathname = usePathname();
  const isActive = pathname === "/ai" || pathname.startsWith("/ai/");

  return (
    <Link
      href="/ai"
      prefetch
      aria-label="Open ATIQ JEHAN Workshop AI Assistant and Agent"
      title="Open Workshop AI Assistant & Action Agent"
      className={cn(
        "ai-generate-btn inline-flex items-center justify-center gap-2 rounded-full",
        "h-10 px-3.5 sm:px-4 text-[13px] font-semibold text-white tracking-[-0.01em]",
        "select-none cursor-pointer shrink-0",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2",
        isActive && "ai-generate-btn-active",
        className
      )}
    >
      <span className="relative z-10 flex items-center gap-2">
        <Sparkles className="h-[15px] w-[15px] text-white ai-sparkle-icon shrink-0" />
        <span className="hidden sm:inline whitespace-nowrap drop-shadow-[0_1px_1px_rgba(16,24,64,0.3)]">
          Generate AI
        </span>
        <span className="sm:hidden text-[12px] font-bold">AI</span>
      </span>
    </Link>
  );
}
