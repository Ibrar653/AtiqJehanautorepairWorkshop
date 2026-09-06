"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Search, Loader2, User, Car, Hash, Phone, Mail, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";

export function GlobalSearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ customers: any[]; vehicles: any[] }>({ customers: [], vehicles: [] });
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const searchRef = useRef<HTMLDivElement>(null);
  const searchSeqRef = useRef<number>(0);
  const globalCacheRef = useRef<Map<string, { customers: any[]; vehicles: any[] }>>(new Map());

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q || q.length < 2) {
      setResults({ customers: [], vehicles: [] });
      setOpen(false);
      setLoading(false);
      return;
    }

    const qLower = q.toLowerCase();
    // Check in-memory cache
    const cached = globalCacheRef.current.get(qLower);
    if (cached) {
      setResults(cached);
      setOpen(true);
      setLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      const currentSeq = ++searchSeqRef.current;
      setLoading(true);
      setOpen(true);
      const supabase = createClient();

      try {
        const fetchPromise = Promise.all([
          supabase
            .from("customers")
            .select("id, name, mobile, email, vehicles(id, make, model, registration_number, chassis_vin)")
            .or(`name.ilike.%${q}%,mobile.ilike.%${q}%`)
            .limit(5),
          supabase
            .from("vehicles")
            .select("id, make, model, year, registration_number, chassis_vin, customer:customers(id, name, mobile, email)")
            .or(`chassis_vin.ilike.%${q}%,registration_number.ilike.%${q}%,make.ilike.%${q}%,model.ilike.%${q}%`)
            .limit(5),
        ]);

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Global search timed out")), 3000)
        );

        const [custRes, vehRes] = await Promise.race([fetchPromise, timeoutPromise]);

        if (currentSeq !== searchSeqRef.current) return;

        const resData = {
          customers: custRes.data || [],
          vehicles: vehRes.data || [],
        };

        globalCacheRef.current.set(qLower, resData);
        setResults(resData);
      } catch (err) {
        if (currentSeq !== searchSeqRef.current) return;
        console.warn("Global search fallback:", err);
      } finally {
        if (currentSeq === searchSeqRef.current) {
          setLoading(false);
        }
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelectCustomer = (id: string) => {
    setOpen(false);
    setQuery("");
    router.push(`/customers/${id}`);
  };

  const handleSelectVehicle = (id: string) => {
    setOpen(false);
    setQuery("");
    router.push(`/vehicles/${id}`);
  };

  const hasResults = results.customers.length > 0 || results.vehicles.length > 0;

  return (
    <div ref={searchRef} className="relative w-full max-w-lg">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Search customers, vehicles, job cards..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim().length >= 2 && setOpen(true)}
          className="pl-10 pr-16 h-10 bg-slate-50/80 hover:bg-slate-50 border-slate-200 focus-visible:bg-white text-[13px] rounded-xl text-slate-800 placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 shadow-2xs transition-all"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
          ) : (
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10.5px] font-semibold text-slate-400 bg-white border border-slate-200 rounded-md shadow-2xs">
              ⌘ K
            </kbd>
          )}
        </div>
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 rounded-xl border bg-popover text-popover-foreground shadow-2xl overflow-hidden max-h-[80vh] overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" /> Searching system...
            </div>
          ) : hasResults ? (
            <div className="divide-y divide-border">
              {/* Vehicles Match Results (Chassis / VIN, Plate, Model match) */}
              {results.vehicles.length > 0 && (
                <div className="p-2">
                  <p className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    Matched Vehicles ({results.vehicles.length})
                  </p>
                  {results.vehicles.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => handleSelectVehicle(v.id)}
                      className="w-full text-left p-3 rounded-lg hover:bg-muted/60 transition-colors flex items-start justify-between gap-3 group"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Car className="h-4 w-4 text-primary shrink-0" />
                          <span className="font-semibold text-sm text-foreground">
                            {v.make} {v.model} {v.year ? `(${v.year})` : ""}
                          </span>
                          {v.registration_number && (
                            <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-bold">
                              {v.registration_number}
                            </span>
                          )}
                        </div>
                        {v.chassis_vin && (
                          <p className="text-xs font-mono text-muted-foreground flex items-center gap-1">
                            <Hash className="h-3 w-3 shrink-0" /> Chassis: <span className="text-foreground font-semibold">{v.chassis_vin}</span>
                          </p>
                        )}
                        {v.customer && (
                          <div className="flex items-center gap-3 text-xs text-muted-foreground pt-0.5">
                            <span className="flex items-center gap-1 font-medium text-foreground">
                              <User className="h-3 w-3 text-muted-foreground" /> {v.customer.name}
                            </span>
                            {v.customer.mobile && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" /> {v.customer.mobile}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-1" />
                    </button>
                  ))}
                </div>
              )}

              {/* Customers Match Results */}
              {results.customers.length > 0 && (
                <div className="p-2">
                  <p className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    Matched Customers ({results.customers.length})
                  </p>
                  {results.customers.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => handleSelectCustomer(c.id)}
                      className="w-full text-left p-3 rounded-lg hover:bg-muted/60 transition-colors flex items-start justify-between gap-3 group"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-primary shrink-0" />
                          <span className="font-semibold text-sm text-foreground">{c.name}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {c.mobile && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" /> {c.mobile}
                            </span>
                          )}
                          {c.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" /> {c.email}
                            </span>
                          )}
                        </div>
                        {c.vehicles && c.vehicles.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {c.vehicles.map((v: any) => (
                              <span key={v.id} className="text-[11px] px-2 py-0.5 rounded bg-muted font-medium text-foreground">
                                {v.make} {v.model} {v.registration_number ? `(${v.registration_number})` : ""}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-1" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No customers or vehicles found matching "{query}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}
