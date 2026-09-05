"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "./auth-context";
import {
  getWorkspaces,
  getActiveWorkspaceId,
  setActiveWorkspaceId as setStoredWorkspaceId,
  createWorkspace as createWorkspaceService,
  updateWorkspace as updateWorkspaceService,
  setWorkspaceStatus as setWorkspaceStatusService,
  type CreateWorkspaceInput,
} from "@/lib/services/workspace-service";
import {
  DEFAULT_WORKSPACE_ID,
  DEFAULT_WORKSPACE_NAME,
  DEFAULT_WORKSPACE_BUSINESS_NAME,
  PRIMARY_OWNER_EMAIL,
} from "@/lib/constants";
import type { Workspace, WorkspaceStatus } from "@/types/database";

interface WorkspaceContextType {
  currentWorkspace: Workspace;
  workspaces: Workspace[];
  loading: boolean;
  isPlatformOwner: boolean;
  switchWorkspace: (workspaceId: string) => void;
  refreshWorkspaces: () => Promise<void>;
  createWorkspace: (input: CreateWorkspaceInput) => Promise<{ success: boolean; workspace?: Workspace; error?: string }>;
  updateWorkspace: (id: string, updates: Partial<Workspace>) => Promise<{ success: boolean; error?: string }>;
  setWorkspaceStatus: (id: string, status: WorkspaceStatus) => Promise<{ success: boolean; error?: string }>;
}

const DEFAULT_WORKSPACE_FALLBACK: Workspace = {
  id: DEFAULT_WORKSPACE_ID,
  name: DEFAULT_WORKSPACE_NAME,
  business_name: DEFAULT_WORKSPACE_BUSINESS_NAME,
  currency: "AED",
  status: "active",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: new Date().toISOString(),
};

const WorkspaceContext = createContext<WorkspaceContextType>({
  currentWorkspace: DEFAULT_WORKSPACE_FALLBACK,
  workspaces: [DEFAULT_WORKSPACE_FALLBACK],
  loading: true,
  isPlatformOwner: false,
  switchWorkspace: () => {},
  refreshWorkspaces: async () => {},
  createWorkspace: async () => ({ success: false }),
  updateWorkspace: async () => ({ success: false }),
  setWorkspaceStatus: async () => ({ success: false }),
});

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([DEFAULT_WORKSPACE_FALLBACK]);
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string>(getActiveWorkspaceId());
  const [loading, setLoading] = useState(true);

  const isPlatformOwner = useMemo(() => {
    if (!user) return false;
    return (
      user.email.toLowerCase() === PRIMARY_OWNER_EMAIL.toLowerCase() ||
      user.id === "usr-owner-001"
    );
  }, [user]);

  const refreshWorkspaces = useCallback(async () => {
    try {
      const list = await getWorkspaces(user?.email);
      if (list && list.length > 0) {
        setWorkspaces(list);

        // Ensure active workspace is still valid
        const storedId = getActiveWorkspaceId();
        const found = list.find((w) => w.id === storedId);
        if (found) {
          setActiveWorkspaceIdState(found.id);
        } else {
          setActiveWorkspaceIdState(list[0].id);
          setStoredWorkspaceId(list[0].id);
        }
      }
    } catch (e) {
      console.warn("Failed to load workspaces:", e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refreshWorkspaces();
  }, [refreshWorkspaces]);

  // Listen to cross-window or custom workspace change events
  useEffect(() => {
    const handleWorkspaceChanged = (event: any) => {
      if (event.detail?.workspaceId) {
        setActiveWorkspaceIdState(event.detail.workspaceId);
      }
    };
    window.addEventListener("atiq_workspace_changed", handleWorkspaceChanged);
    return () => {
      window.removeEventListener("atiq_workspace_changed", handleWorkspaceChanged);
    };
  }, []);

  const currentWorkspace = useMemo<Workspace>(() => {
    return (
      workspaces.find((w) => w.id === activeWorkspaceId) ||
      workspaces[0] ||
      DEFAULT_WORKSPACE_FALLBACK
    );
  }, [workspaces, activeWorkspaceId]);

  const switchWorkspace = useCallback((workspaceId: string) => {
    setStoredWorkspaceId(workspaceId);
    setActiveWorkspaceIdState(workspaceId);
  }, []);

  const createWorkspace = useCallback(
    async (input: CreateWorkspaceInput) => {
      const res = await createWorkspaceService(input, {
        id: user?.id || "usr-owner-001",
        name: user?.full_name || "Platform Owner",
      });
      if (res.success && res.workspace) {
        await refreshWorkspaces();
      }
      return res;
    },
    [user, refreshWorkspaces]
  );

  const updateWorkspace = useCallback(
    async (id: string, updates: Partial<Workspace>) => {
      const res = await updateWorkspaceService(id, updates);
      if (res.success) {
        await refreshWorkspaces();
      }
      return res;
    },
    [refreshWorkspaces]
  );

  const setWorkspaceStatus = useCallback(
    async (id: string, status: WorkspaceStatus) => {
      const res = await setWorkspaceStatusService(id, status);
      if (res.success) {
        await refreshWorkspaces();
      }
      return res;
    },
    [refreshWorkspaces]
  );

  return (
    <WorkspaceContext.Provider
      value={{
        currentWorkspace,
        workspaces,
        loading,
        isPlatformOwner,
        switchWorkspace,
        refreshWorkspaces,
        createWorkspace,
        updateWorkspace,
        setWorkspaceStatus,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
