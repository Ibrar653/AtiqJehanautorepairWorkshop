"use client";

import React, { useEffect, useState } from "react";
import { generateReconciliationReport, type ReconciliationReport } from "@/lib/services/reconciliation-service";
import { RefreshCw, Database, HardDrive, ShieldCheck, AlertTriangle, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function ReconciliationReportPage() {
  const [report, setReport] = useState<ReconciliationReport | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const data = await generateReconciliationReport();
      setReport(data);
    } catch (err) {
      console.error("Error generating reconciliation report:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link
              href="/settings"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Database Reconciliation Report
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Read-only comparison of local browser storage cache vs. authoritative Supabase PostgreSQL database.
          </p>
        </div>

        <button
          onClick={fetchReport}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh Report
        </button>
      </div>

      {/* Summary Cards */}
      {report && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl border border-border bg-card text-card-foreground shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium">
              <Database className="w-4 h-4 text-emerald-500" />
              Supabase Authoritative Mode
            </div>
            <div className="mt-2 text-2xl font-bold text-foreground">
              {report.summary.isSupabaseAuthoritative ? "ACTIVE" : "OFFLINE"}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Direct PostgreSQL transactional CRUD</p>
          </div>

          <div className="p-4 rounded-xl border border-border bg-card text-card-foreground shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium">
              <Database className="w-4 h-4 text-blue-500" />
              Supabase Total Records
            </div>
            <div className="mt-2 text-2xl font-bold text-foreground">
              {report.summary.totalSupabaseRecords}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Live rows in cloud tables</p>
          </div>

          <div className="p-4 rounded-xl border border-border bg-card text-card-foreground shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium">
              <HardDrive className="w-4 h-4 text-amber-500" />
              Local Storage Cache
            </div>
            <div className="mt-2 text-2xl font-bold text-foreground">
              {report.summary.totalLocalRecords}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Cached records in browser</p>
          </div>

          <div className="p-4 rounded-xl border border-border bg-card text-card-foreground shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium">
              <AlertTriangle className="w-4 h-4 text-purple-500" />
              Legacy String IDs Preserved
            </div>
            <div className="mt-2 text-2xl font-bold text-foreground">
              {report.summary.totalLegacyIds}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Preserved in browser for audit</p>
          </div>
        </div>
      )}

      {/* Safety Notice */}
      <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
        <div className="text-sm space-y-1">
          <p className="font-semibold">Zero-Data-Loss Safety Guarantee</p>
          <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80">
            This tool is 100% read-only. No records in browser localStorage or Supabase are deleted, mutated, or overwritten. All live production operations now run strictly against Supabase PostgreSQL with UUID validation.
          </p>
        </div>
      </div>

      {/* Breakdown Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Entities & Tables Breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3 font-semibold">Table / Entity</th>
                <th className="px-6 py-3 font-semibold">Local Cache Key</th>
                <th className="px-6 py-3 font-semibold text-center">Local Records</th>
                <th className="px-6 py-3 font-semibold text-center">Supabase Rows</th>
                <th className="px-6 py-3 font-semibold text-center">Legacy String IDs</th>
                <th className="px-6 py-3 font-semibold">Status / Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                    Auditing database tables...
                  </td>
                </tr>
              ) : (
                report?.tables.map((row) => (
                  <tr key={row.table} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-3.5 font-medium text-foreground">
                      {row.table}
                    </td>
                    <td className="px-6 py-3.5 font-mono text-xs text-muted-foreground">
                      {row.localKey}
                    </td>
                    <td className="px-6 py-3.5 text-center font-semibold text-foreground">
                      {row.localCount}
                    </td>
                    <td className="px-6 py-3.5 text-center font-semibold text-emerald-600 dark:text-emerald-400">
                      {row.supabaseCount}
                    </td>
                    <td className="px-6 py-3.5 text-center text-muted-foreground font-mono text-xs">
                      {row.legacyStringIdCount > 0 ? (
                        <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
                          {row.legacyStringIdCount}
                        </span>
                      ) : (
                        "0"
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-xs text-muted-foreground">
                      {row.notes}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
