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
          className="group flex items-center gap-3 px-3.5 py-2 h-[58px] rounded-2xl bg-gradient-to-b from-white/92 to-[#EEF5FF]/85 dark:from-[#1B2C4D]/90 dark:to-[#13203A]/85 backdrop-blur-md border border-white/95 dark:border-[#2C426B] ring-1 ring-[#CFE0F3]/90 dark:ring-white/10 shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.95),0_4px_14px_rgba(16,45,96,0.08)] hover:-translate-y-[1px] hover:ring-[#9BC5F7] hover:shadow-[inset_0_1.5px_1px_rgba(255,255,255,1),0_8px_20px_rgba(0,104,245,0.14)] active:translate-y-0 text-left font-sans transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[#007BFF]/45 cursor-pointer min-w-[210px] sm:min-w-[270px] max-w-[calc(100vw-130px)] sm:max-w-[380px]"
          title="Switch Active Business Workspace"
        >
          {/* Blue Gradient Icon Container with Inner Lighting */}
          <div className="h-10 w-10 rounded-xl glass-btn-primary text-white flex items-center justify-center shrink-0">
            <Building2 className="w-[18px] h-[18px] text-white drop-shadow-[0_1px_2px_rgba(0,40,120,0.3)]" aria-hidden="true" />
          </div>

          {/* Vertically Centered Two-Line Text Group */}
          <div className="min-w-0 flex-1 flex flex-col justify-center gap-1">
            <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5E738E] dark:text-slate-400 leading-none block">
              CURRENT WORKSPACE
            </span>
            <span className="font-sans text-[13.5px] font-semibold text-[#101D36] dark:text-slate-100 leading-tight truncate block">
              {currentWorkspace.name}
            </span>
          </div>

          {/* Compact Vertically Centered Status Badge */}
          {isDefaultAtiq ? (
            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full font-sans text-[10px] font-semibold uppercase tracking-wider bg-[#E6F2FF] dark:bg-sky-950/60 text-[#0068F5] dark:text-sky-300 border border-[#B8D9FF] dark:border-sky-800/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] shrink-0">
              PRIMARY
            </span>
          ) : (
            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full font-sans text-[10px] font-semibold uppercase tracking-wider bg-purple-50/95 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200/90 dark:border-purple-800/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] shrink-0">
              SECONDARY
            </span>
          )}

          {/* Vertically Centered Dropdown Chevron */}
          <ChevronDown
            className="w-4 h-4 text-[#52657F] dark:text-slate-400 group-hover:text-[#007BFF] shrink-0 transition-transform duration-150 group-data-[popup-open]:rotate-180"
            aria-hidden="true"
          />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-76 glass-menu p-2">
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
