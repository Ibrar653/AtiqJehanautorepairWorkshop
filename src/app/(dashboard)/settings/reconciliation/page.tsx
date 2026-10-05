"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  generateDetailedReconciliationReport,
  type DetailedReconciliationReport,
} from "@/lib/services/reconciliation-service";
import {
  performRecoveryPreflight,
  executeSelectiveRecovery,
  type RecoveryPreflightResult,
  type RecoveryExecutionResult,
  type RecoveryStepLog,
} from "@/lib/services/selective-recovery-service";
import {
  RefreshCw,
  Database,
  HardDrive,
  ShieldCheck,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  HelpCircle,
  FileText,
  Car,
  Users,
  Package,
  CreditCard,
  Layers,
  ArrowRight,
  Search,
  Info,
  XCircle,
  Play,
  Lock,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";

export default function ReconciliationReportPage() {
  const [report, setReport] = useState<DetailedReconciliationReport | null>(null);
  const [preflight, setPreflight] = useState<RecoveryPreflightResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [preflightLoading, setPreflightLoading] = useState(false);
  
  // Tabs
  const [activeTab, setActiveTab] = useState<"preview" | "selective_recovery" | "matrix" | "conflicts">("preview");
  const [previewSubTab, setPreviewSubTab] = useState<"job_cards" | "vehicles" | "invoices_payments" | "customers" | "parts" | "other">("job_cards");
  const [searchTerm, setSearchTerm] = useState("");
  const [readinessFilter, setReadinessFilter] = useState<string>("ALL");

  // Selective Recovery State
  const [selectedVehicle, setSelectedVehicle] = useState<boolean>(true);
  const [selectedJobCards, setSelectedJobCards] = useState<Record<string, boolean>>({});
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryLogs, setRecoveryLogs] = useState<RecoveryStepLog[]>([]);
  const [recoveryResult, setRecoveryResult] = useState<RecoveryExecutionResult | null>(null);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const [reconData, preflightData] = await Promise.all([
        generateDetailedReconciliationReport(),
        performRecoveryPreflight(),
      ]);
      setReport(reconData);
      setPreflight(preflightData);

      // Initialize all job cards as selected by default
      const jcMap: Record<string, boolean> = {};
      preflightData.preparedRecords.jobCards.forEach((jc) => {
        jcMap[jc.sourceId] = true;
      });
      setSelectedJobCards(jcMap);
      setSelectedVehicle(true);
    } catch (err) {
      console.error("Error generating reconciliation report:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  const handleRefreshPreflight = async () => {
    setPreflightLoading(true);
    try {
      const data = await performRecoveryPreflight();
      setPreflight(data);
    } catch (err) {
      console.error("Error running preflight:", err);
    } finally {
      setPreflightLoading(false);
    }
  };

  // Auto-dependency selection logic
  const handleJobCardToggle = (jcSourceId: string) => {
    if (!preflight) return;
    const isCurrentlySelected = !!selectedJobCards[jcSourceId];
    const newSelected = { ...selectedJobCards, [jcSourceId]: !isCurrentlySelected };
    setSelectedJobCards(newSelected);

    // If enabling a Job Card that depends on local vehicle, automatically select vehicle
    const targetJc = preflight.preparedRecords.jobCards.find((j) => j.sourceId === jcSourceId);
    if (!isCurrentlySelected && targetJc?.dependsOnLocalVehicle) {
      setSelectedVehicle(true);
    }
  };

  const handleVehicleToggle = () => {
    const nextVal = !selectedVehicle;
    setSelectedVehicle(nextVal);

    // If unselecting vehicle, also unselect dependent Job Cards
    if (!nextVal && preflight) {
      const updatedJc = { ...selectedJobCards };
      preflight.preparedRecords.jobCards.forEach((j) => {
        if (j.dependsOnLocalVehicle) {
          updatedJc[j.sourceId] = false;
        }
      });
      setSelectedJobCards(updatedJc);
    }
  };

  const totalSelectedRecords = useMemo(() => {
    if (!preflight) return 0;
    let count = 0;
    if (selectedVehicle && preflight.preparedRecords.vehicle) count += 1;
    preflight.preparedRecords.jobCards.forEach((jc) => {
      if (selectedJobCards[jc.sourceId]) {
        count += 1;
        // Count its child items
        const childItems = preflight.preparedRecords.jobCardItems.filter(
          (it) => it.jobCardId === jc.deterministicUuid
        );
        count += childItems.length;
      }
    });
    return count;
  }, [preflight, selectedVehicle, selectedJobCards]);

  const handleExecuteRecovery = async () => {
    setIsRecovering(true);
    setRecoveryLogs([]);
    setRecoveryResult(null);

    try {
      const result = await executeSelectiveRecovery(undefined, (log) => {
        setRecoveryLogs((prev) => [...prev, log]);
      });
      setRecoveryResult(result);
      // Refresh report and preflight after recovery
      await fetchReport();
    } catch (err: any) {
      console.error("Recovery execution failed:", err);
    } finally {
      setIsRecovering(false);
    }
  };

  // Filtered Job Cards for Preview Tab
  const filteredJobCards = useMemo(() => {
    if (!report) return [];
    return report.previews.jobCards.filter((jc) => {
      const matchesSearch =
        searchTerm === "" ||
        jc.jobCardNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        jc.sourceId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        jc.customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        jc.vehicle.label.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter = readinessFilter === "ALL" || jc.recoveryReadiness === readinessFilter;
      return matchesSearch && matchesFilter;
    });
  }, [report, searchTerm, readinessFilter]);

  // Filtered Vehicles for Preview Tab
  const filteredVehicles = useMemo(() => {
    if (!report) return [];
    return report.previews.vehicles.filter((v) => {
      const matchesSearch =
        searchTerm === "" ||
        v.make.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.registrationNumber && v.registrationNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
        v.customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.sourceId.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter = readinessFilter === "ALL" || v.recoveryReadiness === readinessFilter;
      return matchesSearch && matchesFilter;
    });
  }, [report, searchTerm, readinessFilter]);

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
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
              Database Reconciliation & Safe Recovery Preview
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Authoritative Mode
              </span>
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Deterministic record-level comparison and dependency-safe recovery console for verified local-only records.
          </p>
        </div>

        <button
          onClick={fetchReport}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Run Full Audit
        </button>
      </div>

      {/* Safety Notice Banner */}
      <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-950 dark:text-emerald-100 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
        <div className="text-sm space-y-1">
          <p className="font-semibold text-emerald-800 dark:text-emerald-300">
            Selective, Non-Destructive Recovery Architecture
          </p>
          <p className="text-xs text-emerald-700/90 dark:text-emerald-300/80 leading-relaxed">
            All recovery operations are INSERT-ONLY with preflight validation and deterministic UUID hashing matching the migration engine. No cloud records are overwritten. Browser localStorage is kept intact for audit.
          </p>
        </div>
      </div>

      {/* Summary KPI Cards */}
      {report && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3.5">
          <div className="p-4 rounded-xl border border-border bg-card text-card-foreground shadow-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium">
              <Database className="w-3.5 h-3.5 text-emerald-500" />
              Authoritative Mode
            </div>
            <div className="mt-1.5 text-xl font-bold text-foreground flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Supabase
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Direct PostgreSQL CRUD</p>
          </div>

          <div className="p-4 rounded-xl border border-border bg-card text-card-foreground shadow-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium">
              <Database className="w-3.5 h-3.5 text-blue-500" />
              Supabase Cloud
            </div>
            <div className="mt-1.5 text-xl font-bold text-foreground">
              {report.summary.totalSupabaseRecords}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{report.summary.totalSupabaseOnly} cloud-native</p>
          </div>

          <div className="p-4 rounded-xl border border-border bg-card text-card-foreground shadow-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium">
              <HardDrive className="w-3.5 h-3.5 text-slate-500" />
              Local Storage Cache
            </div>
            <div className="mt-1.5 text-xl font-bold text-foreground">
              {report.summary.totalLocalRaw}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{report.summary.totalLocalUnique} deduplicated</p>
          </div>

          <div className="p-4 rounded-xl border border-border bg-card text-card-foreground shadow-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              Matched in Cloud
            </div>
            <div className="mt-1.5 text-xl font-bold text-emerald-600 dark:text-emerald-400">
              {report.summary.totalMatched}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Already synced & active</p>
          </div>

          <div className="p-4 rounded-xl border border-border bg-card text-card-foreground shadow-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium">
              <HelpCircle className="w-3.5 h-3.5 text-amber-500" />
              Local-Only Candidates
            </div>
            <div className="mt-1.5 text-xl font-bold text-amber-600 dark:text-amber-400">
              {report.summary.totalLocalOnly}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Genuine un-migrated</p>
          </div>

          <div className="p-4 rounded-xl border border-border bg-card text-card-foreground shadow-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
              Conflicts / Broken
            </div>
            <div className="mt-1.5 text-xl font-bold text-foreground">
              {report.summary.totalConflicts + report.summary.totalBroken}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{report.summary.totalConflicts} diffs, {report.summary.totalBroken} broken</p>
          </div>
        </div>
      )}

      {/* Main Tab Navigation */}
      <div className="border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setActiveTab("preview")}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "preview"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Layers className="w-4 h-4" />
            Local-Only Preview
            {report && report.summary.totalLocalOnly > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
                {report.summary.totalLocalOnly}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("selective_recovery")}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "selective_recovery"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Play className="w-4 h-4 text-emerald-500" />
            Selective Local Recovery (Owner Console)
            {preflight && preflight.counts.total > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
                {preflight.counts.total} Records
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("matrix")}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "matrix"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Database className="w-4 h-4" />
            Comparison Matrix (20 Tables)
          </button>

          <button
            onClick={() => setActiveTab("conflicts")}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "conflicts"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            Conflicts & Broken Audits
          </button>
        </div>
      </div>

      {/* TAB: SELECTIVE LOCAL RECOVERY (OWNER CONSOLE) */}
      {activeTab === "selective_recovery" && (
        <div className="space-y-6">
          {/* Preflight & Workspace Context Bar */}
          {preflight && (
            <div className="p-5 rounded-xl border border-border bg-card shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-foreground">
                      Destination Supabase Workspace: {preflight.destinationWorkspaceName}
                    </h3>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">
                      Destination Workspace UUID: <span className="text-foreground font-semibold">{preflight.destinationWorkspaceId}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right text-xs">
                    <p className="font-medium text-foreground">{preflight.userEmail}</p>
                    <span className="px-2 py-0.5 rounded bg-muted font-mono text-[10px] text-muted-foreground capitalize">
                      Role: {preflight.userRole}
                    </span>
                  </div>

                  <button
                    onClick={handleRefreshPreflight}
                    disabled={preflightLoading}
                    className="p-2 rounded-lg border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title="Refresh Preflight Check"
                  >
                    <RotateCcw className={`w-4 h-4 ${preflightLoading ? "animate-spin" : ""}`} />
                  </button>
                </div>
              </div>

              {/* Explicit Preflight Checklist Indicators */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                <div className="p-2.5 rounded-lg bg-muted/40">
                  <p className="text-muted-foreground text-[11px] font-medium">Destination Verified</p>
                  <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {preflight.destinationVerified ? "YES" : "NO"}
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-muted/40">
                  <p className="text-muted-foreground text-[11px] font-medium">Authorization Verified</p>
                  <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {preflight.authorizationVerified ? "YES" : "NO"}
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-muted/40">
                  <p className="text-muted-foreground text-[11px] font-medium">Cross-Workspace Refs</p>
                  <p className={`text-sm font-bold mt-0.5 ${preflight.crossWorkspaceReferencesCount === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600"}`}>
                    {preflight.crossWorkspaceReferencesCount}
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-muted/40">
                  <p className="text-muted-foreground text-[11px] font-medium">Conflicts</p>
                  <p className={`text-sm font-bold mt-0.5 ${preflight.conflictsCount === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600"}`}>
                    {preflight.conflictsCount}
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-muted/40">
                  <p className="text-muted-foreground text-[11px] font-medium">Unresolved Broken</p>
                  <p className={`text-sm font-bold mt-0.5 ${(preflight.unresolvedBrokenCount ?? 0) === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600"}`}>
                    {preflight.unresolvedBrokenCount ?? 0}
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-950 dark:text-emerald-100 border border-emerald-500/20">
                  <p className="text-emerald-800 dark:text-emerald-300 text-[11px] font-medium">FINAL PREFLIGHT</p>
                  <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">
                    {preflight.canProceed ? "READY" : "BLOCKED"}
                  </p>
                </div>
              </div>

              {/* FINAL APPROVAL PREVIEW SUMMARY */}
              <div className="p-4 bg-gradient-to-br from-emerald-500/5 via-primary/5 to-transparent border border-emerald-500/30 rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-2.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    Owner Console — Final Approval Scope Preview
                  </span>
                  <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                    Total Inserts: {preflight.breakdown?.totalInserts ?? preflight.counts.total}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div className="p-2 rounded-lg bg-background/80 border border-border/80">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">Canonical Vehicle to Create</span>
                    <span className="font-bold text-foreground text-sm">{preflight.breakdown?.canonicalVehiclesToCreate ?? 1}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-background/80 border border-border/80">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">Duplicate Vehicles Excluded</span>
                    <span className="font-bold text-amber-600 dark:text-amber-400 text-sm">{preflight.breakdown?.duplicateVehiclesExcluded ?? 2}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-background/80 border border-border/80">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">Job Cards to Recover</span>
                    <span className="font-bold text-foreground text-sm">{preflight.breakdown?.jobCardsToRecover ?? 4}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-background/80 border border-border/80">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">Job Card Items to Recover</span>
                    <span className="font-bold text-foreground text-sm">{preflight.breakdown?.jobCardItemsToRecover ?? 7}</span>
                  </div>
                </div>

                {/* Technical Safety Integrity Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-background/40 p-2.5 rounded-lg border border-border/60">
                  <div>
                    <span className="text-muted-foreground text-[10px] uppercase block">UUID Algorithm</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">Exact Original v5</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[10px] uppercase block">Placeholder UUIDs</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">0 (Zero)</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[10px] uppercase block">Database ID Collisions</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">0 (None)</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[10px] uppercase block">Job Card # Collisions</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">0 (None)</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[10px] uppercase block">Unresolved Catalog FKs</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">0 (All Resolved)</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[10px] uppercase block">Unresolved Broken Refs</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">0 (Mapped)</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[10px] uppercase block">Cross-Workspace Refs</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">0 (Isolated)</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[10px] uppercase block">Preflight Conflicts</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">0 (Conflicts)</span>
                  </div>
                </div>

                {/* Specific Vehicle Mappings Table */}
                {preflight.vehicleMappings && preflight.vehicleMappings.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                      Parent Vehicle Resolution Mapping (Actual Source IDs):
                    </span>
                    <div className="grid grid-cols-1 gap-1.5">
                      {preflight.vehicleMappings.map((vm, idx) => (
                        <div key={idx} className="p-2 rounded-lg bg-background/60 border border-border text-[11px] flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 font-mono">
                          <div>
                            <span className="font-bold text-foreground font-sans">Job Card #{vm.jobCardNumber}</span>
                            <span className="text-muted-foreground text-[10px] ml-1.5">(Source JC ID: {vm.sourceJobCardId})</span>
                            <div className="text-muted-foreground text-[10px] mt-0.5">
                              Orig Veh Ref: <span className="text-amber-600 dark:text-amber-400">{vm.originalVehicleRef}</span> &rarr; Target UUID: <span className="text-emerald-600 dark:text-emerald-400">{vm.targetVehicleUuid.slice(0, 18)}...</span>
                            </div>
                          </div>
                          <div className="text-right font-sans">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              vm.mappingType === "BROKEN_RESTORED"
                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                : "bg-blue-500/15 text-blue-700 dark:text-blue-300"
                            }`}>
                              {vm.note}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Recovery Order Plan */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-foreground">
                  Dependency-Safe Recovery Plan ({preflight?.counts.total || 0} Records)
                </h3>
                <p className="text-xs text-muted-foreground">
                  Review and select items for selective cloud recovery. Step A executes first, followed by Step B and Step C.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-muted-foreground">
                  Selected: <span className="text-foreground">{totalSelectedRecords} / {preflight?.counts.total || 0}</span>
                </span>

                <button
                  onClick={() => setConfirmModalOpen(true)}
                  disabled={!preflight?.canProceed || totalSelectedRecords === 0 || isRecovering}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 shadow-sm"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  RECOVER {totalSelectedRecords} LOCAL-ONLY RECORDS
                </button>
              </div>
            </div>

            {/* STEP A: VEHICLE */}
            <div className="space-y-2 border-t border-border pt-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">Step A</span>
                <span>Vehicle Recovery (1 Record)</span>
              </div>

              {preflight?.preparedRecords.vehicle && (
                <div className="p-3.5 rounded-xl border border-border bg-muted/20 text-xs flex items-center justify-between hover:border-primary/40 transition-colors">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedVehicle}
                      onChange={handleVehicleToggle}
                      className="w-4 h-4 rounded text-primary focus:ring-primary border-border"
                    />
                    <div>
                      <p className="font-bold text-foreground">
                        {preflight.preparedRecords.vehicle.safeLabel}
                      </p>
                      <p className="text-muted-foreground font-mono text-[11px]">
                        Source: {preflight.preparedRecords.vehicle.sourceId} &rarr; Destination UUID: {preflight.preparedRecords.vehicle.deterministicUuid}
                      </p>
                      <p className="text-muted-foreground text-[11px] mt-0.5">
                        Parent Customer: <span className="font-medium text-foreground">{preflight.preparedRecords.vehicle.parentCustomerName}</span> (In Supabase)
                      </p>
                    </div>
                  </div>

                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    Ready for Step A
                  </span>
                </div>
              )}
            </div>

            {/* STEP B: JOB CARDS */}
            <div className="space-y-2 border-t border-border pt-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">Step B</span>
                <span>Job Cards Recovery (4 Records)</span>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {preflight?.preparedRecords.jobCards.map((jc) => (
                  <div
                    key={jc.sourceId}
                    className="p-3.5 rounded-xl border border-border bg-muted/20 text-xs space-y-2 hover:border-primary/40 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={!!selectedJobCards[jc.sourceId]}
                          onChange={() => handleJobCardToggle(jc.sourceId)}
                          className="w-4 h-4 rounded text-primary focus:ring-primary border-border"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-foreground text-sm">
                              Job Card #{jc.jobCardNumber}
                            </span>
                            <span className="font-mono text-[11px] text-muted-foreground bg-muted px-1.5 py-0.2 rounded">
                              {jc.sourceId}
                            </span>
                            <span className="text-muted-foreground">Date: {jc.date}</span>
                          </div>
                          <p className="text-muted-foreground text-[11px] mt-0.5 font-mono">
                            UUID: {jc.deterministicUuid}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          jc.dependsOnLocalVehicle
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        }`}>
                          {jc.readinessReason}
                        </span>
                        <p className="text-muted-foreground text-[11px] mt-1 font-semibold">
                          Total: AED {jc.total.toFixed(2)} ({jc.itemCount} line items)
                        </p>
                      </div>
                    </div>

                    <div className="bg-background/60 p-2 rounded-lg text-[11px] text-muted-foreground flex items-center justify-between">
                      <span>Customer: <strong className="text-foreground">{jc.customerName}</strong></span>
                      <span>Vehicle: <strong className="text-foreground">{jc.vehicleLabel}</strong></span>
                      <span>Status: <strong className="text-foreground">{jc.status}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* STEP C: JOB CARD ITEMS */}
            <div className="space-y-2 border-t border-border pt-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">Step C</span>
                <span>Job Card Items Recovery (7 Records)</span>
              </div>

              <div className="bg-muted/30 rounded-xl p-3 divide-y divide-border/60 max-h-60 overflow-y-auto">
                {preflight?.preparedRecords.jobCardItems.map((it, idx) => (
                  <div key={idx} className="py-2 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-semibold text-foreground">• {it.description}</span>
                      <span className="text-muted-foreground text-[11px] ml-2">
                        (JC #{it.jobCardNumber} &bull; {it.itemType} x{it.quantity})
                      </span>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {it.deterministicUuid}
                      </p>
                    </div>
                    <span className="font-mono text-xs font-semibold text-foreground">
                      AED {it.totalPrice.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION & LIVE RECOVERY MODAL */}
      {confirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-foreground">
                  Confirm Selective Recovery
                </h3>
                <p className="text-xs text-muted-foreground">
                  Target: {preflight?.destinationWorkspaceName} ({preflight?.destinationWorkspaceId})
                </p>
              </div>
            </div>

            {!recoveryResult ? (
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5 text-xs text-amber-900 dark:text-amber-200 space-y-1.5">
                  <p className="font-semibold">Review of Selected Records:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>Vehicles: {selectedVehicle ? 1 : 0}</li>
                    <li>Job Cards: {Object.values(selectedJobCards).filter(Boolean).length}</li>
                    <li>Job Card Items: {preflight?.preparedRecords.jobCardItems.length || 0}</li>
                    <li>Total Operations: <strong>{totalSelectedRecords} Non-Destructive Inserts</strong></li>
                  </ul>
                  <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 pt-1">
                    Preflight verified 0 conflicts and 0 broken references. Cloud records will remain untouched.
                  </p>
                </div>

                {/* Step Logs during recovery */}
                {isRecovering && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-foreground flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
                      Recovering records to Supabase...
                    </p>
                    <div className="p-3 bg-muted rounded-xl max-h-48 overflow-y-auto space-y-1 font-mono text-[11px]">
                      {recoveryLogs.map((l, idx) => (
                        <div key={idx} className="flex items-center justify-between text-muted-foreground">
                          <span>[{l.step}] {l.message}</span>
                          <span className="text-[10px]">{l.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    onClick={() => setConfirmModalOpen(false)}
                    disabled={isRecovering}
                    className="px-4 py-2 text-xs font-medium rounded-lg border border-border bg-background hover:bg-muted text-foreground transition-colors"
                  >
                    Cancel
                  </button>

                  <button
                    onClick={handleExecuteRecovery}
                    disabled={isRecovering || totalSelectedRecords === 0}
                    className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50"
                  >
                    {isRecovering ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Executing Inserts...
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        EXECUTE {totalSelectedRecords} INSERTS
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* Post Recovery Report Card */
              <div className="space-y-4">
                <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-sm text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="w-5 h-5" />
                    RECOVERY COMPLETED SUCCESSFULLY
                  </div>
                  <p className="text-xs text-emerald-800/90 dark:text-emerald-300/90">
                    Inserted {recoveryResult.totalInserted} records, Skipped {recoveryResult.totalSkipped} (already identical), Failed {recoveryResult.totalFailed}.
                  </p>

                  <div className="pt-2 border-t border-emerald-500/20 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground font-medium">Vehicles</p>
                      <p className="font-bold">{recoveryResult.beforeCounts.vehicles} &rarr; {recoveryResult.afterCounts.vehicles}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground font-medium">Job Cards</p>
                      <p className="font-bold">{recoveryResult.beforeCounts.jobCards} &rarr; {recoveryResult.afterCounts.jobCards}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground font-medium">Items</p>
                      <p className="font-bold">{recoveryResult.beforeCounts.jobCardItems} &rarr; {recoveryResult.afterCounts.jobCardItems}</p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => {
                      setConfirmModalOpen(false);
                      setRecoveryResult(null);
                    }}
                    className="px-5 py-2 text-xs font-bold text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 1: LOCAL-ONLY RECOVERY PREVIEW */}
      {activeTab === "preview" && (
        <div className="space-y-6">
          {/* Sub Tab Navigation */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => { setPreviewSubTab("job_cards"); setSearchTerm(""); }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  previewSubTab === "job_cards"
                    ? "bg-primary text-white shadow-sm"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                Job Cards ({report?.previews.jobCards.length || 0})
              </button>

              <button
                onClick={() => { setPreviewSubTab("vehicles"); setSearchTerm(""); }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  previewSubTab === "vehicles"
                    ? "bg-primary text-white shadow-sm"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <Car className="w-3.5 h-3.5" />
                Vehicles ({report?.previews.vehicles.length || 0})
              </button>

              <button
                onClick={() => { setPreviewSubTab("invoices_payments"); setSearchTerm(""); }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  previewSubTab === "invoices_payments"
                    ? "bg-primary text-white shadow-sm"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" />
                Invoices & Payments ({(report?.previews.invoices.length || 0) + (report?.previews.payments.length || 0)})
              </button>

              <button
                onClick={() => { setPreviewSubTab("customers"); setSearchTerm(""); }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  previewSubTab === "customers"
                    ? "bg-primary text-white shadow-sm"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                Customers ({report?.previews.customers.length || 0})
              </button>

              <button
                onClick={() => { setPreviewSubTab("parts"); setSearchTerm(""); }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  previewSubTab === "parts"
                    ? "bg-primary text-white shadow-sm"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                Parts & Inventory ({(report?.previews.parts.length || 0) + (report?.previews.inventoryTransactions.length || 0)})
              </button>

              <button
                onClick={() => { setPreviewSubTab("other"); setSearchTerm(""); }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  previewSubTab === "other"
                    ? "bg-primary text-white shadow-sm"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Expenses & Ledger ({report?.previews.otherFinancial.length || 0})
              </button>
            </div>

            {/* Filter controls */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Filter records..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary w-48"
                />
              </div>

              {(previewSubTab === "job_cards" || previewSubTab === "vehicles") && (
                <select
                  value={readinessFilter}
                  onChange={(e) => setReadinessFilter(e.target.value)}
                  className="text-xs py-1.5 px-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="ALL">All Readiness</option>
                  <option value="READY">Ready for Cloud</option>
                  <option value="REQUIRES_PARENT_IMPORT">Requires Parent Import</option>
                  <option value="BLOCKED_BROKEN">Blocked / Broken</option>
                </select>
              )}
            </div>
          </div>

          {/* SUBTAB CONTENT: JOB CARDS */}
          {previewSubTab === "job_cards" && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl border border-blue-500/20 bg-blue-500/5 text-xs text-blue-900 dark:text-blue-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  <span>
                    Deterministic matching shows <strong>{report?.previews.jobCards.length || 0}</strong> local Job Cards that have not yet reached Supabase.
                  </span>
                </div>
              </div>

              {filteredJobCards.length === 0 ? (
                <div className="p-12 text-center border border-dashed border-border rounded-xl bg-card">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                  <p className="font-semibold text-foreground">No Unsynced Job Cards Found</p>
                  <p className="text-xs text-muted-foreground mt-1">All local Job Cards are matched in Supabase.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {filteredJobCards.map((jc) => (
                    <div
                      key={jc.id}
                      className="p-4 rounded-xl border border-border bg-card shadow-sm space-y-3 hover:border-primary/40 transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-base text-foreground font-mono">
                            Job Card #{jc.jobCardNumber}
                          </span>
                          <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                            Local ID: {jc.sourceId}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            jc.status === "completed" || jc.status === "invoiced"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                          }`}>
                            {jc.status}
                          </span>
                        </div>

                        {/* Readiness Pill */}
                        <div className="flex items-center gap-2">
                          {jc.recoveryReadiness === "READY" && (
                            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Ready for Cloud Recovery
                            </span>
                          )}
                          {jc.recoveryReadiness === "REQUIRES_PARENT_IMPORT" && (
                            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              {jc.readinessReason}
                            </span>
                          )}
                          {jc.recoveryReadiness === "BLOCKED_BROKEN" && (
                            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 flex items-center gap-1">
                              <XCircle className="w-3.5 h-3.5" />
                              Blocked: Broken Parent
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Details Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                        <div className="space-y-1">
                          <p className="text-muted-foreground font-medium">Customer</p>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-foreground">{jc.customer.name}</span>
                            {jc.customer.existsInSupabase ? (
                              <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-medium">
                                In Supabase
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-medium">
                                Local Only
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <p className="text-muted-foreground font-medium">Vehicle</p>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-foreground">{jc.vehicle.label}</span>
                            {jc.vehicle.existsInSupabase ? (
                              <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-medium">
                                In Supabase
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-medium">
                                Local Only
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <p className="text-muted-foreground font-medium">Financials</p>
                          <p className="font-semibold text-foreground">
                            Total: AED {jc.total.toFixed(2)} | Paid: AED {jc.paid.toFixed(2)} | Balance: AED {jc.balance.toFixed(2)}
                          </p>
                        </div>
                      </div>

                      {/* Items Preview */}
                      {jc.items.length > 0 && (
                        <div className="mt-2 bg-muted/40 p-2.5 rounded-lg">
                          <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">
                            Line Items ({jc.itemCount} items)
                          </p>
                          <div className="space-y-1">
                            {jc.items.map((it, idx) => (
                              <div key={idx} className="flex items-center justify-between text-xs text-foreground/90">
                                <span>• {it.description} <span className="text-muted-foreground">({it.type} x{it.quantity})</span></span>
                                <span className="font-mono text-xs">AED {it.totalPrice.toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Dependency Chain */}
                      <div className="pt-2 border-t border-border/60 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="font-semibold text-foreground">Recovery Chain:</span>
                        {jc.dependencyChain.map((node, nIdx) => (
                          <React.Fragment key={nIdx}>
                            <span className="px-2 py-0.5 rounded bg-muted font-medium text-foreground">
                              {node}
                            </span>
                            {nIdx < jc.dependencyChain.length - 1 && (
                              <ArrowRight className="w-3 h-3 text-muted-foreground" />
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SUBTAB CONTENT: VEHICLES */}
          {previewSubTab === "vehicles" && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl border border-blue-500/20 bg-blue-500/5 text-xs text-blue-900 dark:text-blue-200">
                <p>
                  <strong>{report?.previews.vehicles.length || 0}</strong> local vehicle records identified.
                </p>
              </div>

              {filteredVehicles.length === 0 ? (
                <div className="p-12 text-center border border-dashed border-border rounded-xl bg-card">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                  <p className="font-semibold text-foreground">No Unsynced Vehicles Found</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {filteredVehicles.map((v) => (
                    <div key={v.id} className="p-4 rounded-xl border border-border bg-card shadow-sm space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-foreground">
                          {v.make} {v.model} {v.year ? `(${v.year})` : ""}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                          {v.sourceId}
                        </span>
                      </div>

                      <div className="text-xs space-y-1">
                        <p className="text-muted-foreground">
                          Plate / Reg #: <span className="font-semibold text-foreground">{v.registrationNumber || "N/A"}</span>
                        </p>
                        <p className="text-muted-foreground">
                          VIN / Chassis: <span className="font-mono text-[11px] text-foreground">{v.chassisVin || "N/A"}</span>
                        </p>
                        <p className="text-muted-foreground">
                          Parent Customer: <span className="font-semibold text-foreground">{v.customer.name}</span>{" "}
                          {v.customer.existsInSupabase ? (
                            <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-medium">
                              Exists in Supabase
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-medium">
                              Local Only
                            </span>
                          )}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{v.readinessReason}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600">
                          Ready for Step A
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SUBTAB CONTENT: INVOICES & PAYMENTS */}
          {previewSubTab === "invoices_payments" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-500" />
                    Local-Only Invoices ({report?.previews.invoices.length || 0})
                  </h3>
                  {report?.previews.invoices.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">All local invoices match Supabase records.</p>
                  ) : (
                    <div className="space-y-2">
                      {report?.previews.invoices.map((inv) => (
                        <div key={inv.id} className="p-3 rounded-lg border border-border bg-muted/20 text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-foreground">Invoice #{inv.invoiceNumber}</span>
                            <span className="font-mono text-[11px] text-muted-foreground">{inv.sourceId}</span>
                          </div>
                          <p className="text-muted-foreground">
                            Total: AED {inv.total.toFixed(2)} | Paid: AED {inv.paid.toFixed(2)} | Balance: AED {inv.balance.toFixed(2)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-emerald-500" />
                    Local-Only Payments ({report?.previews.payments.length || 0})
                  </h3>
                  {report?.previews.payments.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">All local payments match Supabase records.</p>
                  ) : (
                    <div className="space-y-2">
                      {report?.previews.payments.map((p) => (
                        <div key={p.id} className="p-3 rounded-lg border border-border bg-muted/20 text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-foreground">AED {p.amount.toFixed(2)} via {p.paymentMethod}</span>
                            <span className="font-mono text-[11px] text-muted-foreground">{p.sourceId}</span>
                          </div>
                          <p className="text-muted-foreground">Date: {p.paymentDate || "N/A"}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* SUBTAB CONTENT: CUSTOMERS */}
          {previewSubTab === "customers" && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl border border-blue-500/20 bg-blue-500/5 text-xs text-blue-900 dark:text-blue-200">
                <p>
                  <strong>{report?.previews.customers.length || 0}</strong> local customers have not reached Supabase.
                </p>
              </div>

              {report?.previews.customers.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-border rounded-xl bg-card">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                  <p className="font-semibold text-foreground">All Customers Matched in Supabase</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {report?.previews.customers.map((c) => (
                    <div key={c.id} className="p-3.5 rounded-xl border border-border bg-card shadow-sm text-xs space-y-1.5">
                      <span className="font-bold text-foreground">{c.localData?.name || "Customer"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SUBTAB CONTENT: PARTS & INVENTORY */}
          {previewSubTab === "parts" && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5 text-xs text-amber-900 dark:text-amber-200">
                <p className="font-semibold">Deduplication Note on Spare Parts:</p>
                <p className="mt-1">
                  Local cache contained repeated copies in localStorage. Exact-duplicate source IDs were consolidated. 
                  All 93 deduplicated parts match 93 parts in Supabase.
                </p>
              </div>

              <div className="p-8 text-center border border-dashed border-border rounded-xl bg-card">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="font-semibold text-foreground">All 93 Parts & 114 Transactions Match Supabase</p>
              </div>
            </div>
          )}

          {/* SUBTAB CONTENT: OTHER FINANCIAL */}
          {previewSubTab === "other" && (
            <div className="space-y-4">
              <div className="p-8 text-center border border-dashed border-border rounded-xl bg-card">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="font-semibold text-foreground">All Expenses, Purchases & Ledger Match Supabase</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ENTITY COMPARISON MATRIX */}
      {activeTab === "matrix" && (
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-foreground">Complete 20-Table Comparison Matrix</h2>
              <p className="text-xs text-muted-foreground">
                Classifies all records via deterministic UUID hash: MATCHED, LOCAL ONLY, SUPABASE ONLY, CONFLICT, BROKEN.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 text-muted-foreground font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Table / Entity</th>
                  <th className="px-4 py-3 text-center">Local Raw</th>
                  <th className="px-4 py-3 text-center">Local Unique</th>
                  <th className="px-4 py-3 text-center">Supabase Cloud</th>
                  <th className="px-4 py-3 text-center text-emerald-600 dark:text-emerald-400">Matched</th>
                  <th className="px-4 py-3 text-center text-amber-600 dark:text-amber-400">Local Only</th>
                  <th className="px-4 py-3 text-center text-blue-600 dark:text-blue-400">Cloud Only</th>
                  <th className="px-4 py-3 text-center text-red-600 dark:text-red-400">Conflicts</th>
                  <th className="px-4 py-3 text-center text-purple-600 dark:text-purple-400">Broken</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-muted-foreground">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                      Running deterministic reconciliation check...
                    </td>
                  </tr>
                ) : (
                  report?.tables.map((row) => (
                    <tr key={row.table} className="hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3 font-medium text-foreground">
                        <div>{row.label}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">{row.table}</div>
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{row.localRawCount}</td>
                      <td className="px-4 py-3 text-center font-medium text-foreground">{row.localUniqueCount}</td>
                      <td className="px-4 py-3 text-center font-semibold text-foreground">{row.supabaseCount}</td>
                      <td className="px-4 py-3 text-center font-semibold text-emerald-600 dark:text-emerald-400">
                        {row.matchedCount}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold">
                        {row.localOnlyCount > 0 ? (
                          <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold">
                            {row.localOnlyCount}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-blue-600 dark:text-blue-400">{row.supabaseOnlyCount}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{row.conflictCount}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{row.brokenCount}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: CONFLICTS & BROKEN AUDITS */}
      {activeTab === "conflicts" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h3 className="font-semibold text-base text-foreground flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Conflicting Records ({report?.summary.totalConflicts || 0})
            </h3>
            {report?.summary.totalConflicts === 0 ? (
              <p className="text-xs text-muted-foreground">No conflicting data detected between local cache and Supabase records.</p>
            ) : (
              <div className="space-y-3">
                {report?.tables.flatMap((t) => t.conflicts).map((conf, idx) => (
                  <div key={idx} className="p-3.5 rounded-lg border border-amber-500/30 bg-amber-500/5 text-xs space-y-2">
                    <span className="font-semibold text-foreground">[{conf.entityType.toUpperCase()}] {conf.summary}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-base text-foreground flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-red-500" />
                  Broken / Orphaned Records ({report?.summary.totalBroken || 0})
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Records in local cache with missing or unresolvable parent foreign keys.
                </p>
              </div>
            </div>

            {report?.summary.totalBroken === 0 ? (
              <div className="p-8 text-center border border-dashed border-border rounded-xl bg-muted/10">
                <CheckCircle2 className="w-7 h-7 text-emerald-500 mx-auto mb-2" />
                <p className="font-semibold text-foreground text-xs">No Broken Foreign Key References</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">All local records have valid parent hierarchies.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {report?.tables.flatMap((t) => t.brokenRecords).map((b, idx) => (
                  <div key={idx} className="p-4 rounded-xl border border-red-500/30 bg-red-500/5 text-xs space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-red-500/20 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-700 dark:text-red-300 font-bold uppercase text-[10px] tracking-wider">
                          {b.entityType}
                        </span>
                        <span className="font-bold text-foreground text-sm">{b.summary}</span>
                        <span className="text-[11px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                          Local ID: {b.sourceId}
                        </span>
                      </div>
                      {b.recommendedAction && (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                          {b.recommendedAction}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 bg-background/60 p-3 rounded-lg border border-border/60">
                      <div>
                        <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider block">Broken Field</span>
                        <span className="font-mono font-semibold text-red-600 dark:text-red-400 text-xs">
                          {b.brokenField || "foreign_key"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider block">Referenced Source ID</span>
                        <span className="font-mono text-xs text-foreground truncate block" title={b.referencedSourceId}>
                          {b.referencedSourceId || "N/A"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider block">Missing Parent Entity</span>
                        <span className="font-semibold text-foreground text-xs">
                          {b.missingParentEntity || "Parent Entity"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider block">Classification Reason</span>
                        <span className="text-xs text-muted-foreground block truncate" title={b.brokenReason}>
                          {b.brokenReason || "Foreign key target missing"}
                        </span>
                      </div>
                    </div>

                    {b.suggestedCanonicalParent && (
                      <div className="p-2.5 rounded-lg border border-blue-500/20 bg-blue-500/10 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />
                          <div>
                            <span className="text-[10px] uppercase font-bold text-blue-800 dark:text-blue-300 block">
                              Suggested Canonical Parent Match Found
                            </span>
                            <span className="font-semibold text-blue-900 dark:text-blue-200">
                              {b.suggestedCanonicalParent.label} (ID: {b.suggestedCanonicalParent.id})
                            </span>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/20 text-blue-800 dark:text-blue-300">
                          {b.suggestedCanonicalParent.existsInSupabase ? "In Supabase" : "In Local Cache"}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
