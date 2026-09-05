"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  searchCustomersAndVehicles,
  getCustomerById,
  createCustomer,
  checkDuplicateCustomerPhone,
  type CustomerWithMetrics,
  type UnifiedSearchResult,
} from "@/lib/services/customer-service";
import type { Customer, Vehicle } from "@/types/database";
import {
  Search,
  Loader2,
  User,
  Phone,
  Mail,
  Plus,
  X,
  Check,
  AlertCircle,
  Save,
  UserCheck,
  MapPin,
  Car,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CombinedCustomerVehicleModal } from "@/components/shared/combined-customer-vehicle-modal";

interface CustomerSearchSelectProps {
  selectedCustomerId?: string | null;
  selectedVehicleId?: string | null;
  onSelectCustomer: (customer: CustomerWithMetrics | null, vehicle?: Vehicle | null) => void;
  error?: string | null;
  showAddButton?: boolean;
  placeholder?: string;
}

export function CustomerSearchSelect({
  selectedCustomerId,
  selectedVehicleId,
  onSelectCustomer,
  error,
  showAddButton = true,
  placeholder = "Search by Customer Name, Phone, Vehicle Make/Model, Plate, Chassis...",
}: CustomerSearchSelectProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UnifiedSearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithMetrics | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // New Customer Inline Modal State
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const searchSeqRef = useRef<number>(0);

  // Load initial selected customer if ID provided
  useEffect(() => {
    if (selectedCustomerId && (!selectedCustomer || selectedCustomer.id !== selectedCustomerId)) {
      getCustomerById(selectedCustomerId)
        .then((cust) => {
          if (cust) {
            const formatted: CustomerWithMetrics = {
              ...cust,
              vehicles: (cust as any).vehicles || [],
              outstanding_balance: (cust as any).outstanding_balance || 0,
            };
            setSelectedCustomer(formatted);
          }
        })
        .catch(console.error);
    } else if (!selectedCustomerId && selectedCustomer) {
      setSelectedCustomer(null);
      setSelectedVehicle(null);
    }
  }, [selectedCustomerId]);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced search query with race-condition guard
  const performSearch = useCallback(async (searchQuery: string) => {
    const cleanQ = searchQuery.trim();
    if (cleanQ.length < 2) {
      setResults([]);
      setDropdownOpen(false);
      setLoading(false);
      setSearchError(null);
      return;
    }

    const currentSeq = ++searchSeqRef.current;
    setLoading(true);
    setSearchError(null);
    setDropdownOpen(true);
    setSelectedIndex(-1);

    try {
      const res = await searchCustomersAndVehicles(cleanQ, 10);
      if (currentSeq !== searchSeqRef.current) {
        // Discard stale responses from older keystrokes
        return;
      }
      setResults(res);
    } catch (err: any) {
      if (currentSeq !== searchSeqRef.current) return;
      console.error("Customer/Vehicle search error:", err);
      setSearchError("Unable to search");
    } finally {
      if (currentSeq === searchSeqRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);

    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    const clean = val.trim();
    if (clean.length >= 2) {
      setDropdownOpen(true);
      setLoading(true);
      setSearchError(null);
    } else {
      setResults([]);
      setDropdownOpen(false);
      setLoading(false);
      return;
    }

    searchTimerRef.current = setTimeout(() => {
      performSearch(val);
    }, 250);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!dropdownOpen && results.length > 0 && e.key === "ArrowDown") {
      setDropdownOpen(true);
      return;
    }

    if (!dropdownOpen) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < results.length) {
        handleSelectUnified(results[selectedIndex]);
      }
    } else if (e.key === "Escape") {
      setDropdownOpen(false);
    }
  };

  const handleSelectUnified = (item: UnifiedSearchResult) => {
    const formatted: CustomerWithMetrics = {
      ...item.customer,
      vehicles: (item.customer as any).vehicles || [],
      outstanding_balance: (item.customer as any).outstanding_balance || 0,
    };
    setSelectedCustomer(formatted);
    setSelectedVehicle(item.vehicle || null);
    onSelectCustomer(formatted, item.vehicle || null);
    setDropdownOpen(false);
    setQuery("");
  };

  const handleClearSelection = () => {
    setSelectedCustomer(null);
    setSelectedVehicle(null);
    onSelectCustomer(null, null);
    setQuery("");
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  const openInlineAddCustomer = () => {
    setDropdownOpen(false);
    setAddCustomerOpen(true);
  };

  return (
    <div ref={containerRef} className="space-y-2 relative z-30 overflow-visible">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">
          Customer &amp; Vehicle Search <span className="text-destructive">*</span>
        </Label>
        {showAddButton && !selectedCustomer && (
          <button
            type="button"
            onClick={openInlineAddCustomer}
            className="text-xs text-primary font-semibold hover:underline flex items-center gap-1 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Add New Customer
          </button>
        )}
      </div>

      {selectedCustomer ? (
        <div className="p-3.5 rounded-xl border-2 border-primary/40 bg-primary/5 flex items-center justify-between shadow-sm animate-in fade-in-50">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
              <UserCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm text-foreground flex items-center gap-2">
                <span className="truncate">{selectedCustomer.name}</span>
                <Check className="h-4 w-4 text-emerald-500 shrink-0" />
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                {selectedCustomer.mobile && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {selectedCustomer.mobile}
                  </span>
                )}
                {selectedCustomer.trn_number && (
                  <span className="flex items-center gap-1 font-mono font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 text-[11px]">
                    TRN: {selectedCustomer.trn_number}
                  </span>
                )}
                {selectedVehicle && (
                  <span className="flex items-center gap-1 font-semibold text-primary">
                    <Car className="h-3 w-3" /> {selectedVehicle.make} {selectedVehicle.model} ({selectedVehicle.registration_number || "No Plate"})
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClearSelection}
              className="h-8 px-2.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              <X className="h-3.5 w-3.5 mr-1" /> Change
            </Button>
          </div>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            placeholder={placeholder}
            value={query}
            onChange={handleQueryChange}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (query.trim().length >= 2) {
                setDropdownOpen(true);
                if (results.length === 0 && !loading) {
                  performSearch(query);
                }
              }
            }}
            className="pl-9 pr-9 h-11 text-sm shadow-sm bg-background"
          />
          {loading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />
          )}

          {dropdownOpen && (
            <div
              className="absolute left-0 right-0 top-full mt-1.5 rounded-xl border border-border bg-card text-card-foreground shadow-2xl overflow-hidden max-h-80 overflow-y-auto"
              style={{ minWidth: "100%", zIndex: 99999 }}
            >
              {loading ? (
                <div className="p-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="font-medium">Searching...</span>
                </div>
              ) : searchError ? (
                <div className="p-4 text-center text-xs text-destructive flex items-center justify-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{searchError}</span>
                </div>
              ) : results.length > 0 ? (
                <div className="p-1.5 divide-y divide-border/40">
                  {results.map((item, idx) => {
                    const isSelected = idx === selectedIndex;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectUnified(item);
                        }}
                        onClick={() => handleSelectUnified(item)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors group cursor-pointer ${
                          isSelected ? "bg-primary/10 text-foreground" : "hover:bg-muted/70"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">
                                {item.customer.name}
                              </span>
                              {item.customer.mobile && (
                                <span className="text-xs font-mono font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                  {item.customer.mobile}
                                </span>
                              )}
                              {item.customer.trn_number && (
                                <span className="text-[10px] font-mono font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                                  TRN: {item.customer.trn_number}
                                </span>
                              )}
                            </div>

                            {item.vehicle ? (
                              <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                                <span className="flex items-center gap-1 font-semibold text-primary">
                                  <Car className="h-3.5 w-3.5" />
                                  {item.vehicle.make} {item.vehicle.model}{" "}
                                  {item.vehicle.year ? `(${item.vehicle.year})` : ""}
                                </span>
                                {item.vehicle.registration_number && (
                                  <span className="bg-primary/10 text-primary border border-primary/25 font-mono font-black px-1.5 py-0.5 rounded text-[10.5px]">
                                    Plate: {item.vehicle.registration_number}
                                  </span>
                                )}
                                {item.vehicle.chassis_vin && (
                                  <span className="text-muted-foreground font-mono text-[10.5px]">
                                    VIN: {item.vehicle.chassis_vin}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <p className="mt-0.5 text-xs text-muted-foreground italic flex items-center gap-1">
                                <Car className="h-3 w-3 opacity-60" /> No vehicle registered yet
                              </p>
                            )}
                          </div>

                          <div className="shrink-0 flex items-center pt-0.5">
                            <span className="text-[9.5px] font-bold uppercase px-2 py-0.5 rounded-full bg-muted text-muted-foreground border">
                              {item.matchType === "customer_trn"
                                ? "TRN Match"
                                : item.matchType === "vehicle_reg"
                                ? "Reg Match"
                                : item.matchType === "vehicle_vin"
                                ? "VIN Match"
                                : item.matchType === "vehicle_model"
                                ? "Vehicle Match"
                                : item.matchType === "customer_phone"
                                ? "Phone Match"
                                : "Customer"}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  <div className="pt-1.5 mt-1">
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        openInlineAddCustomer();
                      }}
                      onClick={openInlineAddCustomer}
                      className="w-full py-2 px-3 text-xs text-primary font-medium hover:bg-primary/5 rounded-md flex items-center justify-center gap-1.5"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add as New Customer: "{query}"
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4 text-center space-y-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">No customer found</p>
                    <p className="text-xs text-muted-foreground">
                      No matches found for <span className="font-semibold text-foreground">"{query}"</span>
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      openInlineAddCustomer();
                    }}
                    onClick={openInlineAddCustomer}
                    className="w-full text-xs"
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Add New Customer
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs text-destructive flex items-center gap-1 mt-1">
          <AlertCircle className="h-3.5 w-3.5" /> {error}
        </p>
      )}

      {/* Combined Customer & Vehicle Modal */}
      <CombinedCustomerVehicleModal
        open={addCustomerOpen}
        onOpenChange={setAddCustomerOpen}
        initialCustomerName={query.trim()}
        onSuccess={(cust, veh) => {
          setSelectedCustomer(cust);
          setSelectedVehicle(veh);
          onSelectCustomer(cust, veh);
          setDropdownOpen(false);
          setQuery("");
        }}
      />
    </div>
  );
}

