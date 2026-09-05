"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getUserActivityLogs, getPermissionChangeLogs } from "@/lib/services/user-service";
import type { User, UserActivityLog, PermissionChangeLog } from "@/types/database";
import {
  Clock,
  Search,
  ShieldAlert,
  Sliders,
  UserCheck,
  FileText,
  CreditCard,
  ClipboardList,
  BookOpen,
  LogOut,
  LogIn,
  KeyRound,
  RefreshCw,
  ArrowRight,
  Shield,
  Layers,
} from "lucide-react";

interface UserActivityModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
}

const ACTION_ICONS: Record<string, React.ElementType> = {
  LOGIN: LogIn,
  LOGOUT: LogOut,
  USER_CREATED: UserCheck,
  USER_UPDATED: RefreshCw,
  STATUS_CHANGED: ShieldAlert,
  PERMISSION_CHANGED: Sliders,
  JOB_CARD_CREATED: ClipboardList,
  JOB_CARD_EDITED: ClipboardList,
  INVOICE_CREATED: FileText,
  PAYMENT_RECORDED: CreditCard,
  LEDGER_ENTRY: BookOpen,
  TRANSFER_MONEY: ArrowRight,
  RECORD_DELETED: ShieldAlert,
  USER_DELETED: ShieldAlert,
};

const ACTION_COLORS: Record<string, string> = {
  LOGIN: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300",
  LOGOUT: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-300",
  USER_CREATED: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300",
  STATUS_CHANGED: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300",
  PERMISSION_CHANGED: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300",
  JOB_CARD_CREATED: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300",
  JOB_CARD_EDITED: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300",
  INVOICE_CREATED: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300",
  PAYMENT_RECORDED: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300",
  LEDGER_ENTRY: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300",
  TRANSFER_MONEY: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300",
  RECORD_DELETED: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300",
  USER_DELETED: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300",
};

export function UserActivityModal({ open, onOpenChange, user }: UserActivityModalProps) {
  const [activeTab, setActiveTab] = useState("activities");
  const [activities, setActivities] = useState<UserActivityLog[]>([]);
  const [permLogs, setPermLogs] = useState<PermissionChangeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [acts, perms] = await Promise.all([
        getUserActivityLogs(user ? user.id : undefined),
        getPermissionChangeLogs(user ? user.id : undefined),
      ]);
      setActivities(acts);
      setPermLogs(perms);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, loadData]);

  const filteredActivities = activities.filter((a) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      a.action.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.user_name.toLowerCase().includes(q) ||
      (a.record_reference && a.record_reference.toLowerCase().includes(q))
    );
  });

  const filteredPermLogs = permLogs.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.change_summary.toLowerCase().includes(q) ||
      p.operator_name.toLowerCase().includes(q) ||
      p.target_user_name.toLowerCase().includes(q)
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-full max-h-[85vh] flex flex-col p-6 gap-4 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        <DialogHeader className="pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2">
            <div>
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-600" />
                {user ? `Activity & Audit Log: ${user.full_name}` : "System Staff Activity & Audit Trail"}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {user
                  ? `Historical logins, operations, and permission revisions for ${user.email} (${user.role.toUpperCase()})`
                  : "Workshop system-wide operational activity logs and administrative changes"}
              </DialogDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={loading}
              className="h-8 text-xs px-2.5 gap-1"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </DialogHeader>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <Input
            placeholder="Search activities by description, user, action or document reference..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>

        {/* Tabs: Activity Timeline & Permission Diff Logs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="bg-slate-100 dark:bg-slate-800/80 p-1 rounded-lg w-full grid grid-cols-2">
            <TabsTrigger value="activities" className="text-xs flex items-center justify-center gap-1.5 py-1.5 font-medium">
              <Layers className="w-3.5 h-3.5" />
              Operational Activity ({filteredActivities.length})
            </TabsTrigger>
            <TabsTrigger value="permissions" className="text-xs flex items-center justify-center gap-1.5 py-1.5 font-medium">
              <Sliders className="w-3.5 h-3.5" />
              Permission Change History ({filteredPermLogs.length})
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: OPERATIONAL ACTIVITIES */}
          <TabsContent value="activities" className="flex-1 overflow-y-auto mt-3 pr-1 divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <div className="py-12 text-center text-xs text-slate-400">Loading activity timeline...</div>
            ) : filteredActivities.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">No activity logs recorded yet.</div>
            ) : (
              filteredActivities.map((log) => {
                const Icon = ACTION_ICONS[log.action] || Clock;
                const badgeColor = ACTION_COLORS[log.action] || "bg-slate-100 text-slate-700";

                return (
                  <div key={log.id} className="py-3 px-1 flex items-start gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-900/50 rounded-lg transition-colors">
                    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 mt-0.5 border border-slate-200 dark:border-slate-700">
                      <Icon className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${badgeColor}`}>
                            {log.action.replace(/_/g, " ")}
                          </span>
                          <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                            {log.user_name}
                          </span>
                          {log.record_reference && (
                            <span className="text-[11px] font-mono font-semibold px-1.5 py-0.2 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded">
                              {log.record_reference}
                            </span>
                          )}
                        </div>

                        <span className="text-[11px] text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(log.timestamp).toLocaleString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                        {log.description}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </TabsContent>

          {/* TAB 2: PERMISSION CHANGE HISTORY */}
          <TabsContent value="permissions" className="flex-1 overflow-y-auto mt-3 pr-1 divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <div className="py-12 text-center text-xs text-slate-400">Loading permission audit trail...</div>
            ) : filteredPermLogs.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">No permission modifications recorded.</div>
            ) : (
              filteredPermLogs.map((p) => (
                <div key={p.id} className="py-3 px-1 flex items-start gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-900/50 rounded-lg transition-colors">
                  <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-950 flex items-center justify-center shrink-0 mt-0.5 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300">
                    <Sliders className="w-4 h-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded border bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300">
                          PERMISSIONS REVISED
                        </span>
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          Modified by {p.operator_name}
                        </span>
                        <ArrowRight className="w-3 h-3 text-slate-400" />
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                          Target: {p.target_user_name}
                        </span>
                      </div>

                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(p.timestamp).toLocaleString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    <div className="p-2 mt-1.5 bg-slate-50 dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-700 dark:text-slate-300">
                      {p.change_summary}
                    </div>
                  </div>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
