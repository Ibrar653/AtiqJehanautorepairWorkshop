"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getLocalDataSummary,
  downloadLocalDataBackup,
  executeLocalDataMigrationToSupabase,
  runPreMigrationDryRun,
  type LocalDataSummary,
  type PreMigrationDryRunResult,
  type MigrationStepProgress,
  type MigrationExecutionResult,
} from "@/lib/services/data-migration-service";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Database,
  Download,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Users,
  Car,
  Wrench,
  Receipt,
  CreditCard,
  Package,
  DollarSign,
  Loader2,
  ShieldCheck,
  RefreshCw,
  Info,
  ShieldAlert,
  PlayCircle,
  XCircle,
} from "lucide-react";

interface DatabaseMigrationTabProps {
  workspaceId: string;
  isOwnerOrAdmin: boolean;
}

export function DatabaseMigrationTab({ workspaceId, isOwnerOrAdmin }: DatabaseMigrationTabProps) {
  const [summary, setSummary] = useState<LocalDataSummary | null>(null);
  const [dryRunReport, setDryRunReport] = useState<PreMigrationDryRunResult | null>(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [currentProgress, setCurrentProgress] = useState<MigrationStepProgress | null>(null);
  const [migrationResult, setMigrationResult] = useState<MigrationExecutionResult | null>(null);
  const [backupDownloaded, setBackupDownloaded] = useState(false);
  const [backupFilename, setBackupFilename] = useState<string | null>(null);

  const refreshScan = useCallback(() => {
    const s = getLocalDataSummary(workspaceId);
    setSummary(s);
    const dr = runPreMigrationDryRun(workspaceId);
    setDryRunReport(dr);
  }, [workspaceId]);

  useEffect(() => {
    refreshScan();
  }, [refreshScan]);

  const handleExportBackup = () => {
    const res = downloadLocalDataBackup(workspaceId);
    if (res.success) {
      setBackupDownloaded(true);
      setBackupFilename(res.filename);
    }
  };

  const handleStartMigration = async () => {
    if (!dryRunReport?.canMigrate) {
      return;
    }

    setConfirmModalOpen(false);
    setMigrating(true);
    setMigrationResult(null);
    setCurrentProgress(null);

    try {
      const result = await executeLocalDataMigrationToSupabase(
        (progress) => {
          setCurrentProgress(progress);
        },
        workspaceId
      );
      setMigrationResult(result);
    } catch (err: any) {
      console.error("Migration execution failed", err);
    } finally {
      setMigrating(false);
      refreshScan();
    }
  };

  if (!isOwnerOrAdmin) {
    return (
      <Card className="border-border/60 shadow-xs">
        <CardContent className="p-8 text-center space-y-3">
          <ShieldCheck className="w-12 h-12 text-slate-400 mx-auto" />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">Owner Access Required</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            The database migration and backup tool is restricted to the primary workshop Owner and Super Admin.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <Card className="border-indigo-100 dark:border-indigo-950/60 bg-linear-to-r from-indigo-50/60 via-white to-sky-50/40 dark:from-indigo-950/20 dark:via-slate-900 dark:to-sky-950/10 shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-indigo-600 text-white shadow-xs">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Cloud Data Migration &amp; Backup Tool
                </CardTitle>
                <CardDescription className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Export browser backups, validate source data integrity via Dry Run, and safely migrate into Supabase.
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={refreshScan}
                className="h-8 text-xs gap-1.5 border-slate-200 dark:border-slate-800"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Re-scan Data
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 text-xs">
            <Info className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <p className="font-semibold">Zero-Deletion &amp; Deduplication Guarantee</p>
              <p className="text-amber-800/90 dark:text-amber-300/80 mt-0.5">
                Exact duplicate rows (e.g. repeated default parts) are automatically filtered out using original source IDs. Existing local browser storage and downloaded backups will <strong>NEVER</strong> be modified or deleted.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pre-Migration Dry Run Validation Card */}
      {dryRunReport && (
        <Card className={`border shadow-xs ${dryRunReport.canMigrate ? "border-emerald-200 dark:border-emerald-800/60 bg-white dark:bg-slate-900" : "border-rose-300 dark:border-rose-800 bg-rose-50/20 dark:bg-rose-950/20"}`}>
          <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {dryRunReport.canMigrate ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
                )}
                <div>
                  <CardTitle className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Pre-Migration Dry Run Validation
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Validated: {new Date(dryRunReport.validatedAt).toLocaleTimeString()} &bull; Total Raw: <strong className="text-slate-800 dark:text-slate-200">{dryRunReport.totalRaw}</strong> &bull; Unique Clean: <strong className="text-emerald-700 dark:text-emerald-300">{dryRunReport.totalUnique}</strong> &bull; Exact Duplicates Ignored: <strong className="text-amber-700 dark:text-amber-300">{dryRunReport.totalDuplicatesIgnored}</strong>
                  </CardDescription>
                </div>
              </div>

              <Badge variant={dryRunReport.canMigrate ? "default" : "destructive"} className="text-[11px] font-bold px-2.5 py-0.5">
                {dryRunReport.canMigrate ? "DRY RUN PASSED - READY" : "MIGRATION BLOCKED"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {dryRunReport.blockingReason && (
              <div className="p-3 bg-rose-100/60 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 text-xs font-semibold flex items-center gap-2 border-b border-rose-200 dark:border-rose-800">
                <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{dryRunReport.blockingReason}</span>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 font-semibold text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="p-2.5">Entity</th>
                    <th className="p-2.5">Raw Rows</th>
                    <th className="p-2.5">Unique IDs</th>
                    <th className="p-2.5">Duplicates Ignored</th>
                    <th className="p-2.5">Conflicting IDs</th>
                    <th className="p-2.5">Broken Foreign Keys</th>
                    <th className="p-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {dryRunReport.entities.map((e) => (
                    <tr key={e.table} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="p-2.5 font-semibold text-slate-900 dark:text-slate-100">{e.entity}</td>
                      <td className="p-2.5 font-mono text-slate-600 dark:text-slate-400">{e.rawCount}</td>
                      <td className="p-2.5 font-mono font-bold text-emerald-700 dark:text-emerald-400">{e.uniqueCount}</td>
                      <td className="p-2.5 font-mono text-amber-700 dark:text-amber-400">
                        {e.duplicateCount > 0 ? `-${e.duplicateCount}` : "0"}
                      </td>
                      <td className="p-2.5 font-mono">
                        {e.conflictingCount > 0 ? (
                          <span className="font-bold text-rose-600 dark:text-rose-400">{e.conflictingCount}</span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="p-2.5 font-mono">
                        {e.brokenFkCount > 0 ? (
                          <span className="font-bold text-rose-600 dark:text-rose-400">{e.brokenFkCount}</span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="p-2.5">
                        {e.conflictingCount === 0 && e.brokenFkCount === 0 ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Clean
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-medium">
                            <AlertTriangle className="w-3.5 h-3.5" /> Issues Found
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Action Card */}
      <Card className="border-border/80 bg-white dark:bg-slate-900 shadow-xs">
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Migration Execution &amp; Backup Actions
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Clean unique records to migrate: <span className="font-semibold text-emerald-700 dark:text-emerald-400">{dryRunReport?.totalUnique ?? 0}</span> (from {dryRunReport?.totalRaw ?? 0} raw rows)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleExportBackup}
              className="h-9 text-xs font-semibold gap-2 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Download className="w-4 h-4 text-blue-600" />
              Download JSON Backup
            </Button>

            <Button
              type="button"
              onClick={() => setConfirmModalOpen(true)}
              disabled={migrating || !dryRunReport?.canMigrate}
              className={`h-9 text-xs font-semibold gap-2 text-white shadow-xs ${dryRunReport?.canMigrate ? "bg-indigo-600 hover:bg-indigo-700" : "bg-slate-400 cursor-not-allowed"}`}
            >
              {migrating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Migrating to Cloud...
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4" />
                  Start Cloud Migration
                </>
              )}
            </Button>
          </div>

          {backupDownloaded && (
            <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800/60">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>
                Backup saved: <strong>{backupFilename}</strong>. Keep this file in a safe location.
              </span>
            </div>
          )}

          {/* Active Migration Progress */}
          {migrating && currentProgress && (
            <div className="space-y-2 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-indigo-600 dark:text-indigo-400">
                  Processing: {currentProgress.step}
                </span>
                <span className="text-slate-600 dark:text-slate-300">
                  {currentProgress.processed} / {currentProgress.total} unique records
                </span>
              </div>
              <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                  style={{
                    width: `${currentProgress.total > 0 ? (currentProgress.processed / currentProgress.total) * 100 : 100}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Post-Migration Report */}
          {migrationResult && (
            <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {migrationResult.success ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                  )}
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {migrationResult.success
                      ? "Cloud Migration Completed Successfully"
                      : "Migration Completed with Warnings/Errors"}
                  </h4>
                </div>
                <Badge variant={migrationResult.success ? "default" : "destructive"}>
                  {migrationResult.errors.length} Errors
                </Badge>
              </div>

              {/* Verification Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 font-semibold text-slate-600 dark:text-slate-300">
                    <tr>
                      <th className="p-2.5">Table</th>
                      <th className="p-2.5">Unique Clean Count</th>
                      <th className="p-2.5">Supabase Count</th>
                      <th className="p-2.5">Integrity Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {migrationResult.verification.map((v) => (
                      <tr key={v.table} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                        <td className="p-2.5 font-mono capitalize">{v.table.replace(/_/g, " ")}</td>
                        <td className="p-2.5">{v.uniqueCount}</td>
                        <td className="p-2.5 font-semibold text-slate-800 dark:text-slate-200">
                          {v.supabaseCount}
                        </td>
                        <td className="p-2.5">
                          {v.matched ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Matched
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-medium">
                              <AlertTriangle className="w-3.5 h-3.5" /> {v.notes || "Mismatch"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {migrationResult.errors.length > 0 && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs space-y-1">
                  <p className="font-semibold">Error Log Details:</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {migrationResult.errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={confirmModalOpen} onOpenChange={setConfirmModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100">
              <UploadCloud className="w-5 h-5 text-indigo-600" />
              Confirm Cloud Data Migration
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 pt-1">
              Transfer {dryRunReport?.totalUnique} unique verified business records into the active Supabase workspace?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs text-slate-600 dark:text-slate-300">
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1.5">
              <p className="font-semibold text-slate-900 dark:text-slate-100">Migration Safety Guarantees:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>{dryRunReport?.totalDuplicatesIgnored} exact duplicate rows will be ignored (e.g. repeated parts).</li>
                <li>{dryRunReport?.totalUnique} unique records will be mapped to deterministic UUIDs.</li>
                <li>All parent/child relationships (Customer &rarr; Vehicle, Job Card &rarr; Invoice, Payments) are preserved.</li>
                <li>Existing browser storage will <strong>NOT</strong> be deleted.</li>
              </ul>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmModalOpen(false)}
              className="h-8 text-xs font-medium"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleStartMigration}
              className="h-8 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Start Migration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
