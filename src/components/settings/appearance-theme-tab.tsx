"use client";

import React from "react";
import { useTheme, type Theme } from "@/lib/context/theme-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sun, Moon, Laptop, CheckCircle2, Sparkles, Printer, ShieldCheck, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

export function AppearanceThemeTab() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  const themes: {
    id: Theme;
    title: string;
    subtitle: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    accentColor: string;
    swatches: { name: string; hex: string; border?: boolean }[];
  }[] = [
    {
      id: "light",
      title: "Light Theme",
      subtitle: "Clean enterprise daytime mode",
      description: "Approved automotive ERP palette with crisp white cards, light canvas (#F6F8FB), dark slate text, and Royal Blue accents.",
      icon: Sun,
      accentColor: "from-amber-500/20 to-amber-500/5 text-amber-600 dark:text-amber-400 border-amber-500/30",
      swatches: [
        { name: "Canvas", hex: "#F6F8FB", border: true },
        { name: "Cards", hex: "#FFFFFF", border: true },
        { name: "Text", hex: "#111827" },
        { name: "Accent", hex: "#2563EB" },
      ],
    },
    {
      id: "dark",
      title: "Dark Theme",
      subtitle: "Deep navy enterprise night mode",
      description: "Carefully calibrated dark theme with dark canvas (#0B1120), navy panels (#172033), high-contrast text (#F8FAFC), and vibrant blue (#3B82F6).",
      icon: Moon,
      accentColor: "from-blue-500/20 to-indigo-500/5 text-blue-600 dark:text-blue-400 border-blue-500/30",
      swatches: [
        { name: "Canvas", hex: "#0B1120" },
        { name: "Panels", hex: "#172033" },
        { name: "Text", hex: "#F8FAFC", border: true },
        { name: "Accent", hex: "#3B82F6" },
      ],
    },
    {
      id: "system",
      title: "System Default",
      subtitle: "Automatic OS synchronization",
      description: "Dynamically matches your Windows, macOS, or mobile OS light/dark schedule. Updates instantly when your OS mode shifts.",
      icon: Laptop,
      accentColor: "from-purple-500/20 to-purple-500/5 text-purple-600 dark:text-purple-400 border-purple-500/30",
      swatches: [
        { name: "Light OS", hex: "#FFFFFF", border: true },
        { name: "Dark OS", hex: "#0B1120" },
        { name: "Dynamic", hex: "#2563EB" },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <Card className="border-border bg-card shadow-xs">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-xl font-bold tracking-tight text-foreground">
                  Appearance &amp; Theme
                </CardTitle>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  <Sparkles className="w-3 h-3" />
                  Real-Time
                </span>
              </div>
              <CardDescription className="text-sm text-muted-foreground mt-1">
                Choose how the workshop management system appears on this device.
              </CardDescription>
            </div>

            {/* Current Applied Status Pill */}
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-muted/60 border border-border shrink-0">
              <span className="text-xs text-muted-foreground font-medium">Applied Theme:</span>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-primary uppercase tracking-wider">
                {resolvedTheme === "dark" ? (
                  <Moon className="w-3.5 h-3.5 text-blue-400" />
                ) : (
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                )}
                {resolvedTheme} mode
                {theme === "system" && (
                  <span className="text-[10px] text-muted-foreground lowercase font-normal">
                    (via system)
                  </span>
                )}
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-2">
          {/* Selectable Theme Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {themes.map((item) => {
              const isSelected = theme === item.id;
              const Icon = item.icon;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTheme(item.id)}
                  className={cn(
                    "text-left relative flex flex-col justify-between p-5 rounded-2xl border-2 transition-all duration-200 cursor-pointer group bg-card",
                    isSelected
                      ? "border-blue-600 dark:border-blue-500 ring-4 ring-blue-500/15 shadow-md"
                      : "border-border hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-xs"
                  )}
                >
                  {/* Top Bar with Icon & Radio Check */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-4">
                      <div
                        className={cn(
                          "w-11 h-11 rounded-xl flex items-center justify-center border shadow-2xs transition-transform group-hover:scale-105",
                          item.accentColor
                        )}
                      >
                        <Icon className="w-5 h-5" />
                      </div>

                      {isSelected ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-600 text-white shadow-2xs animate-in zoom-in-95">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Active
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
                          Select
                        </span>
                      )}
                    </div>

                    {/* Title & Subtitle */}
                    <h3 className="text-base font-bold text-foreground tracking-tight">
                      {item.title}
                    </h3>
                    <p className="text-[11.5px] font-semibold text-blue-600 dark:text-blue-400 mt-0.5">
                      {item.subtitle}
                    </p>

                    {/* Description */}
                    <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                      {item.description}
                    </p>
                  </div>

                  {/* Visual Preview Box */}
                  <div className="mt-5 pt-4 border-t border-border/80">
                    {/* Mockup Preview Area */}
                    {item.id === "light" && (
                      <div className="rounded-xl overflow-hidden border border-slate-200 bg-[#F6F8FB] p-2 space-y-1.5 shadow-2xs">
                        <div className="h-2.5 w-full bg-white rounded flex items-center px-1 gap-1 border border-slate-200/80">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                          <div className="w-8 h-1 bg-slate-200 rounded" />
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          <div className="h-7 bg-white rounded border border-slate-200/80 p-1">
                            <div className="w-5 h-1 bg-slate-300 rounded" />
                            <div className="w-3 h-1.5 bg-blue-600 rounded mt-1" />
                          </div>
                          <div className="h-7 bg-white rounded border border-slate-200/80 p-1">
                            <div className="w-5 h-1 bg-slate-300 rounded" />
                            <div className="w-4 h-1.5 bg-emerald-600 rounded mt-1" />
                          </div>
                          <div className="h-7 bg-white rounded border border-slate-200/80 p-1">
                            <div className="w-5 h-1 bg-slate-300 rounded" />
                            <div className="w-3 h-1.5 bg-amber-500 rounded mt-1" />
                          </div>
                        </div>
                      </div>
                    )}

                    {item.id === "dark" && (
                      <div className="rounded-xl overflow-hidden border border-[#273449] bg-[#0B1120] p-2 space-y-1.5 shadow-2xs">
                        <div className="h-2.5 w-full bg-[#172033] rounded flex items-center px-1 gap-1 border border-[#273449]">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                          <div className="w-8 h-1 bg-slate-600 rounded" />
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          <div className="h-7 bg-[#172033] rounded border border-[#273449] p-1">
                            <div className="w-5 h-1 bg-slate-600 rounded" />
                            <div className="w-3 h-1.5 bg-blue-400 rounded mt-1" />
                          </div>
                          <div className="h-7 bg-[#172033] rounded border border-[#273449] p-1">
                            <div className="w-5 h-1 bg-slate-600 rounded" />
                            <div className="w-4 h-1.5 bg-emerald-400 rounded mt-1" />
                          </div>
                          <div className="h-7 bg-[#172033] rounded border border-[#273449] p-1">
                            <div className="w-5 h-1 bg-slate-600 rounded" />
                            <div className="w-3 h-1.5 bg-amber-400 rounded mt-1" />
                          </div>
                        </div>
                      </div>
                    )}

                    {item.id === "system" && (
                      <div className="rounded-xl overflow-hidden border border-border bg-gradient-to-r from-[#F6F8FB] to-[#0B1120] p-2 space-y-1.5 shadow-2xs">
                        <div className="h-2.5 w-full bg-gradient-to-r from-white to-[#172033] rounded flex items-center px-1 gap-1 border border-border">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                          <div className="w-8 h-1 bg-slate-400/50 rounded" />
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          <div className="h-7 bg-white rounded border border-slate-200 p-1">
                            <div className="w-6 h-1 bg-slate-300 rounded" />
                            <div className="text-[8px] font-bold text-slate-700 mt-1">Light OS</div>
                          </div>
                          <div className="h-7 bg-[#172033] rounded border border-[#273449] p-1">
                            <div className="w-6 h-1 bg-slate-600 rounded" />
                            <div className="text-[8px] font-bold text-slate-200 mt-1">Dark OS</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Color Swatch Badges */}
                    <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                      {item.swatches.map((swatch) => (
                        <div
                          key={swatch.name}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted/60 border border-border text-[10px] text-muted-foreground"
                          title={`${swatch.name}: ${swatch.hex}`}
                        >
                          <span
                            className={cn(
                              "w-2.5 h-2.5 rounded-full shrink-0",
                              swatch.border && "border border-slate-300 dark:border-slate-600"
                            )}
                            style={{ backgroundColor: swatch.hex }}
                          />
                          <span className="font-mono">{swatch.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Enterprise Guarantees & Information Notice */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border bg-card p-4 shadow-xs flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Printer className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-foreground">Print Protection Guaranteed</h4>
            <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed">
              Invoices, job cards, payment receipts, and reports will always print on clean white backgrounds with zero dark tint.
            </p>
          </div>
        </Card>

        <Card className="border-border bg-card p-4 shadow-xs flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-foreground">Per-Device Preference</h4>
            <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed">
              Theme changes only affect your current browser and screen. Workshop records, ledger accounts, and user roles remain untouched.
            </p>
          </div>
        </Card>

        <Card className="border-border bg-card p-4 shadow-xs flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <Eye className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-foreground">Zero-Flash Hydration</h4>
            <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed">
              Theme settings are saved in local storage and cookies so pages reload smoothly without flashing white screens.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
