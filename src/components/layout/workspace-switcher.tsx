"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/context/workspace-context";
import { DEFAULT_WORKSPACE_ID } from "@/lib/constants";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Building2, ChevronDown, Check, Plus, Shield, Layers } from "lucide-react";
import { CreateWorkspaceModal } from "@/components/settings/create-workspace-modal";

export function WorkspaceSwitcher() {
  const router = useRouter();
  const { currentWorkspace, workspaces, isPlatformOwner, switchWorkspace } = useWorkspace();
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const isDefaultAtiq = currentWorkspace.id === DEFAULT_WORKSPACE_ID;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex items-center gap-2.5 px-3 py-1.5 h-10 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 shadow-2xs cursor-pointer max-w-[280px]"
          title="Switch Active Business Workspace"
        >
          <div className="w-7 h-7 rounded-lg bg-[#0F172A] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
            <Building2 className="w-3.5 h-3.5 text-blue-400" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-none">
              Current Workspace
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[12.5px] font-bold text-slate-900 truncate block leading-tight">
                {currentWorkspace.name}
              </span>
              {isDefaultAtiq ? (
                <span className="text-[8.5px] bg-blue-50 text-blue-700 font-bold px-1.5 py-0.5 rounded-[4px] uppercase tracking-wider shrink-0 border border-blue-200">
                  PRIMARY
                </span>
              ) : (
                <span className="text-[8.5px] bg-purple-50 text-purple-700 font-bold px-1.5 py-0.5 rounded-[4px] uppercase tracking-wider shrink-0 border border-purple-200">
                  SECONDARY
                </span>
              )}
            </div>
          </div>

          <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-0.5" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-72 bg-card p-1.5 shadow-md border border-border rounded-xl">
          <DropdownMenuLabel className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold px-2 py-1.5 flex items-center justify-between">
            <span>Workspaces / Businesses</span>
            {isPlatformOwner && (
              <span className="text-[10px] text-purple-600 dark:text-purple-400 font-bold flex items-center gap-1">
                <Shield className="w-3 h-3" /> Super Admin
              </span>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          <div className="max-h-60 overflow-y-auto py-1 space-y-1">
            {workspaces.map((ws) => {
              const isSelected = ws.id === currentWorkspace.id;
              const isAtiq = ws.id === DEFAULT_WORKSPACE_ID;

              return (
                <DropdownMenuItem
                  key={ws.id}
                  onClick={() => switchWorkspace(ws.id)}
                  className={`flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer text-xs transition-colors ${
                    isSelected
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-md flex items-center justify-center font-bold text-xs shrink-0 ${
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {ws.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="truncate font-medium">{ws.name}</span>
                        {isAtiq ? (
                          <span className="text-[8px] bg-primary/10 text-primary px-1 rounded-[4px] font-bold uppercase">
                            PRIMARY
                          </span>
                        ) : (
                          <span className="text-[8px] bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-300 px-1 rounded-[4px] font-bold uppercase">
                            SECONDARY
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {ws.currency} &bull; {ws.email || "Workshop"}
                      </p>
                    </div>
                  </div>

                  {isSelected && <Check className="w-4 h-4 text-primary shrink-0 ml-2" />}
                </DropdownMenuItem>
              );
            })}
          </div>

          {isPlatformOwner && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setCreateModalOpen(true)}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold text-primary cursor-pointer hover:bg-primary/5"
              >
                <Plus className="w-4 h-4" />
                <span>+ Create New Workspace</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => router.push("/settings?tab=workspaces")}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Manage All Workspaces</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Quick Workspace Creation Modal */}
      {isPlatformOwner && (
        <CreateWorkspaceModal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          onCreated={(newWs) => {
            switchWorkspace(newWs.id);
          }}
        />
      )}
    </>
  );
}
