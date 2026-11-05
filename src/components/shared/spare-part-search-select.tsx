"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Search,
  Package,
  Loader2,
  X,
  ChevronDown,
  Check,
  AlertTriangle,
  Wrench,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { getParts, getPartById } from "@/lib/services/parts-service";
import type { Part } from "@/types/database";
import { useWorkspace } from "@/lib/context/workspace-context";
import { DEFAULT_WORKSPACE_ID } from "@/lib/constants";

export interface SparePartSearchSelectProps {
  /** Currently selected catalog part ID (null/empty when none or custom part) */
  selectedPartId?: string | null;
  /** Display label to preserve when editing existing records before/without catalog match */
  selectedPartLabel?: string;
  /** Preloaded parts catalog from parent to enable instant zero-latency filtering */
  initialParts?: Part[];
  /** Callback when a catalog spare part is selected */
  onSelectPart: (part: Part, effectiveAvailableStock: number) => void;
  /** Optional callback when user switches the row to a Custom / Manual non-catalog item */
  onSelectCustom?: () => void;
  /** Whether to show the "Custom / Manual Part (Non-Catalog)" option in row mode */
  allowCustomOption?: boolean;
  /** Whether this row is currently in custom/manual non-catalog mode */
  isCustomSelected?: boolean;
  /** Map of part_id -> quantity already allocated to the current Job Card / Invoice being edited */
  allocatedStockMap?: Map<string, number> | Record<string, number>;
  /** If true, clears the search input immediately after selecting a part (ideal for top quick-add bar) */
  clearOnSelect?: boolean;
  /** Input placeholder (defaults to "Search spare part name or part number...") */
  placeholder?: string;
  /** Disable interaction */
  disabled?: boolean;
  /** Optional workspace ID override */
  workspaceId?: string;
  /** Additional wrapper className */
  className?: string;
  /** Compact height variant for dense table rows */
  compact?: boolean;
  /** Optional callback to notify parent when new parts are fetched from server search */
  onCatalogDiscovered?: (parts: Part[]) => void;
}

export function SparePartSearchSelect({
  selectedPartId,
  selectedPartLabel,
  initialParts = [],
  onSelectPart,
  onSelectCustom,
  allowCustomOption = false,
  isCustomSelected = false,
  allocatedStockMap,
  clearOnSelect = false,
  placeholder = "Search spare part name or part number...",
  disabled = false,
  workspaceId,
  className,
  compact = false,
  onCatalogDiscovered,
}: SparePartSearchSelectProps) {
  const { currentWorkspace } = useWorkspace();
  const activeWorkspaceId =
    workspaceId || currentWorkspace?.id || DEFAULT_WORKSPACE_ID;

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [serverParts, setServerParts] = useState<Part[]>([]);
  const [resolvedSelectedPart, setResolvedSelectedPart] = useState<Part | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const requestSeqRef = useRef(0);

  // Helper to get already allocated quantity for a part when editing an existing record
  const getAllocatedQty = useCallback(
    (partId: string): number => {
      if (!allocatedStockMap || !partId) return 0;
      if (allocatedStockMap instanceof Map) {
        return Number(allocatedStockMap.get(partId) || 0);
      }
      return Number(allocatedStockMap[partId] || 0);
    },
    [allocatedStockMap]
  );

  // Merge initialParts and serverParts without duplicates, scoped to active workspace
  const mergedCatalog = useMemo(() => {
    const map = new Map<string, Part>();
    for (const p of initialParts) {
      if (p && p.id && (!p.workspace_id || p.workspace_id === activeWorkspaceId) && !p.is_deleted) {
        map.set(p.id, p);
      }
    }
    for (const p of serverParts) {
      if (p && p.id && (!p.workspace_id || p.workspace_id === activeWorkspaceId) && !p.is_deleted) {
        map.set(p.id, p);
      }
    }
    if (resolvedSelectedPart && resolvedSelectedPart.id) {
      map.set(resolvedSelectedPart.id, resolvedSelectedPart);
    }
    return Array.from(map.values());
  }, [initialParts, serverParts, resolvedSelectedPart, activeWorkspaceId]);

  // Resolve currently selected part object
  const selectedPart = useMemo(() => {
    if (!selectedPartId) return null;
    return mergedCatalog.find((p) => p.id === selectedPartId) || resolvedSelectedPart || null;
  }, [selectedPartId, mergedCatalog, resolvedSelectedPart]);

  // If editing an existing record and selectedPartId is not yet in initialParts, fetch it from Supabase
  useEffect(() => {
    let active = true;
    if (
      selectedPartId &&
      !initialParts.some((p) => p.id === selectedPartId) &&
      !serverParts.some((p) => p.id === selectedPartId) &&
      resolvedSelectedPart?.id !== selectedPartId
    ) {
      getPartById(selectedPartId, activeWorkspaceId)
        .then((part) => {
          if (active && part) {
            setResolvedSelectedPart(part);
            onCatalogDiscovered?.([part]);
          }
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [selectedPartId, activeWorkspaceId, initialParts, serverParts, resolvedSelectedPart?.id, onCatalogDiscovered]);

  // Debounced server-side search in Supabase for active workspace
  useEffect(() => {
    if (!isOpen) return;

    const trimmed = searchQuery.trim();
    const seq = ++requestSeqRef.current;

    // If dropdown just opened with empty query and we already have initialParts, still fetch fresh page 1 quietly
    const debounceMs = trimmed ? 220 : 80;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const { parts } = await getParts("all", trimmed || undefined, 1, 50, activeWorkspaceId);
        if (seq === requestSeqRef.current) {
          setServerParts(parts || []);
          if (parts && parts.length > 0) {
            onCatalogDiscovered?.(parts);
          }
        }
      } catch (err) {
        console.error("Spare part search error:", err);
      } finally {
        if (seq === requestSeqRef.current) {
          setIsSearching(false);
        }
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [searchQuery, isOpen, activeWorkspaceId, onCatalogDiscovered]);

  // Immediate case-insensitive client-side filtering across name, part_number/SKU, brand/category, description, location
  const filteredParts = useMemo(() => {
    const activeCatalog = mergedCatalog.filter(
      (p) => p.is_active !== false || p.id === selectedPartId
    );

    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return activeCatalog.slice(0, 50);
    }

    const tokens = q.split(/\s+/).filter(Boolean);

    return activeCatalog
      .filter((part) => {
        const name = (part.name || "").toLowerCase();
        const partNumber = (part.part_number || "").toLowerCase();
        const brand = (part.brand || "").toLowerCase();
        const description = (part.description || "").toLowerCase();
        const location = (part.location || "").toLowerCase();
        const haystack = `${name} ${partNumber} ${brand} ${description} ${location}`;

        return tokens.every((token) => haystack.includes(token));
      })
      .sort((a, b) => {
        // Prioritize exact or prefix matches on part_number and name
        const aNum = (a.part_number || "").toLowerCase();
        const bNum = (b.part_number || "").toLowerCase();
        const aName = (a.name || "").toLowerCase();
        const bName = (b.name || "").toLowerCase();

        const aExact = aNum === q || aName === q ? 0 : aNum.startsWith(q) || aName.startsWith(q) ? 1 : 2;
        const bExact = bNum === q || bName === q ? 0 : bNum.startsWith(q) || bName.startsWith(q) ? 1 : 2;
        if (aExact !== bExact) return aExact - bExact;
        return aName.localeCompare(bName);
      })
      .slice(0, 50);
  }, [mergedCatalog, searchQuery, selectedPartId]);

  // Reset highlighted index when filtered results change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchQuery, filteredParts.length, isOpen]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keep highlighted item scrolled into view during keyboard navigation
  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const optionEl = listRef.current.querySelector(
      `[data-option-index="${highlightedIndex}"]`
    ) as HTMLElement | null;
    if (optionEl) {
      optionEl.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex, isOpen]);

  const handleSelectOption = useCallback(
    (part: Part) => {
      const allocated = getAllocatedQty(part.id);
      const effectiveAvailableStock = Math.max(0, Number(part.current_stock || 0) + allocated);

      onSelectPart(part, effectiveAvailableStock);
      setIsOpen(false);
      setSearchQuery("");
      if (clearOnSelect) {
        inputRef.current?.blur();
      }
    },
    [getAllocatedQty, onSelectPart, clearOnSelect]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        return;
      }
      if (filteredParts.length > 0) {
        setHighlightedIndex((prev) => (prev + 1) % filteredParts.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        return;
      }
      if (filteredParts.length > 0) {
        setHighlightedIndex((prev) =>
          prev - 1 < 0 ? filteredParts.length - 1 : prev - 1
        );
      }
    } else if (e.key === "Enter") {
      if (isOpen) {
        e.preventDefault();
        e.stopPropagation();
        const targetPart = filteredParts[highlightedIndex];
        if (targetPart) {
          const allocated = getAllocatedQty(targetPart.id);
          const effectiveStock = Number(targetPart.current_stock || 0) + allocated;
          const isSelectable = effectiveStock > 0 || targetPart.id === selectedPartId;
          if (isSelectable) {
            handleSelectOption(targetPart);
          }
        }
      }
    } else if (e.key === "Escape") {
      if (isOpen) {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
        setSearchQuery("");
        inputRef.current?.blur();
      }
    }
  };

  // Compute display string when closed and a part or existing row value is selected
  const hasSelection = !clearOnSelect && (Boolean(selectedPartId) || Boolean(selectedPartLabel) || isCustomSelected);

  const closedDisplayLabel = useMemo(() => {
    if (clearOnSelect) return "";
    if (selectedPart) {
      return selectedPart.part_number
        ? `${selectedPart.name} (#${selectedPart.part_number})`
        : selectedPart.name;
    }
    if (selectedPartLabel && selectedPartLabel.trim()) {
      return selectedPartLabel.trim();
    }
    if (isCustomSelected) {
      return "Custom / Manual Part (Non-Catalog)";
    }
    return "";
  }, [clearOnSelect, selectedPart, selectedPartLabel, isCustomSelected]);

  const selectedEffectiveStock = useMemo(() => {
    if (!selectedPart) return null;
    return Number(selectedPart.current_stock || 0) + getAllocatedQty(selectedPart.id);
  }, [selectedPart, getAllocatedQty]);

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      {/* Search / Trigger Input */}
      <div className="relative flex items-center w-full">
        <Search
          className={cn(
            "pointer-events-none absolute left-3 text-slate-400 transition-colors",
            isOpen && "text-blue-600 dark:text-blue-400",
            compact ? "h-3.5 w-3.5" : "h-4 w-4"
          )}
        />

        {!isOpen && hasSelection ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              if (!disabled) {
                setIsOpen(true);
                setSearchQuery("");
                setTimeout(() => inputRef.current?.focus(), 10);
              }
            }}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-lg border bg-white dark:bg-slate-900 text-left transition-all",
              "border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30",
              compact ? "min-h-9 pl-8 pr-2.5 py-1.5 text-xs" : "min-h-10 pl-9 pr-3 py-2 text-sm",
              disabled && "opacity-60 cursor-not-allowed"
            )}
          >
            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-1.5 truncate">
                <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {closedDisplayLabel}
                </span>
              </div>
              {selectedPart && (
                <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  {selectedPart.part_number && (
                    <span className="font-mono font-semibold text-slate-600 dark:text-slate-300">
                      SKU: {selectedPart.part_number}
                    </span>
                  )}
                  {selectedPart.brand && (
                    <span>• {selectedPart.brand}</span>
                  )}
                  <span>• {formatCurrency(Number(selectedPart.selling_price || 0))}</span>
                  {selectedEffectiveStock !== null && (
                    <span
                      className={cn(
                        "font-semibold",
                        selectedEffectiveStock > 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                      )}
                    >
                      • Stock: {selectedEffectiveStock} {selectedPart.unit || "pcs"}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0 text-slate-400">
              <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400 hidden sm:inline">
                Change
              </span>
              <ChevronDown className="h-3.5 w-3.5" />
            </div>
          </button>
        ) : (
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={isOpen}
            aria-autocomplete="list"
            disabled={disabled}
            value={searchQuery}
            placeholder={placeholder}
            onFocus={() => {
              if (!disabled) setIsOpen(true);
            }}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (!isOpen) setIsOpen(true);
            }}
            onKeyDown={handleKeyDown}
            className={cn(
              "w-full rounded-lg border bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 transition-all",
              "border-slate-200 dark:border-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20",
              compact ? "h-9 pl-8 pr-8 text-xs" : "h-10 pl-9 pr-9 text-sm",
              disabled && "opacity-60 cursor-not-allowed"
            )}
          />
        )}

        {/* Right spinner or clear button when input is active */}
        {(isOpen || !hasSelection) && (
          <div className="absolute right-2.5 flex items-center gap-1">
            {isSearching && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
            )}
            {searchQuery ? (
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setSearchQuery("");
                  inputRef.current?.focus();
                }}
                className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                title="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : isOpen && hasSelection ? (
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setIsOpen(false);
                  setSearchQuery("");
                }}
                className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                title="Close search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        )}
      </div>

      {/* Dropdown Combobox Menu */}
      {isOpen && !disabled && (
        <div
          ref={listRef}
          role="listbox"
          className={cn(
            "absolute left-0 right-0 top-full mt-1.5 z-[100] min-w-[280px] sm:min-w-[360px] max-h-72 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-black/5 divide-y divide-slate-100 dark:divide-slate-800"
          )}
        >
          {/* Optional Custom / Non-Catalog Part action */}
          {allowCustomOption && onSelectCustom && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelectCustom();
                setIsOpen(false);
                setSearchQuery("");
              }}
              className={cn(
                "w-full px-3.5 py-2.5 text-left flex items-center justify-between gap-2 transition-colors",
                "bg-slate-50/70 hover:bg-blue-50/60 dark:bg-slate-800/40 dark:hover:bg-slate-800 text-xs"
              )}
            >
              <span className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
                <Wrench className="h-3.5 w-3.5 text-slate-400" />
                Custom / Manual Part (Non-Catalog Item)
              </span>
              {isCustomSelected && !selectedPartId && (
                <Check className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              )}
            </button>
          )}

          {filteredParts.length === 0 ? (
            <div className="px-4 py-6 text-center">
              {isSearching ? (
                <div className="flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                  <span>Searching spare parts inventory...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <Package className="h-6 w-6 text-slate-300 dark:text-slate-600 mb-1" />
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    No matching spare parts found
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    Try searching by part name, part number/SKU, or brand.
                  </p>
                </div>
              )}
            </div>
          ) : (
            filteredParts.map((part, idx) => {
              const allocated = getAllocatedQty(part.id);
              const effectiveStock = Number(part.current_stock || 0) + allocated;
              const isOutOfStock = effectiveStock <= 0 && part.id !== selectedPartId;
              const isLowStock =
                !isOutOfStock &&
                effectiveStock <= Number(part.minimum_stock || 5);
              const isHighlighted = idx === highlightedIndex;
              const isSelected = part.id === selectedPartId;

              return (
                <div
                  key={part.id}
                  role="option"
                  aria-selected={isSelected}
                  data-option-index={idx}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (!isOutOfStock) {
                      handleSelectOption(part);
                    }
                  }}
                  className={cn(
                    "px-3.5 py-2.5 flex items-start justify-between gap-3 transition-colors select-none",
                    isOutOfStock
                      ? "opacity-55 cursor-not-allowed bg-slate-50/60 dark:bg-slate-900/40"
                      : "cursor-pointer",
                    !isOutOfStock && isHighlighted
                      ? "bg-blue-50/90 dark:bg-blue-950/50"
                      : !isOutOfStock && "hover:bg-slate-50 dark:hover:bg-slate-800/60",
                    isSelected && "bg-blue-50/50 dark:bg-blue-950/30"
                  )}
                >
                  {/* Left: Part Name, Part Number / SKU, Brand/Category & Location */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-slate-100 truncate">
                        {part.name}
                      </span>
                      {isSelected && (
                        <Check className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                      )}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-700 dark:text-slate-300">
                        {part.part_number ? `Part #${part.part_number}` : "No SKU"}
                      </span>
                      {part.brand && (
                        <span className="inline-flex items-center rounded bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">
                          {part.brand}
                        </span>
                      )}
                      {part.location && (
                        <span className="text-[10px] text-slate-400">
                          Loc: {part.location}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: Selling Price in AED & Available Stock */}
                  <div className="flex flex-col items-end shrink-0 text-right">
                    <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                      {formatCurrency(Number(part.selling_price || 0))}
                    </span>
                    <span
                      className={cn(
                        "mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
                        isOutOfStock
                          ? "bg-red-100 text-red-700 dark:bg-red-950/70 dark:text-red-300"
                          : isLowStock
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300"
                          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300"
                      )}
                    >
                      {isOutOfStock ? (
                        <>
                          <AlertTriangle className="h-2.5 w-2.5" />
                          Out of Stock (0)
                        </>
                      ) : (
                        <>
                          Stock: {effectiveStock} {part.unit || "pcs"}
                        </>
                      )}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
