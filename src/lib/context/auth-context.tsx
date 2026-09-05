"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { getCurrentUser } from "@/lib/services/user-service";
import { createClient } from "@/lib/supabase/client";
import {
  PRIMARY_OWNER_EMAIL,
  getDefaultPermissionsForRole,
  getDefaultFinancialVisibility,
  getDefaultApprovalLimits,
  getDefaultDataScope,
} from "@/lib/constants";
import type {
  User,
  UserRole,
  AppModule,
  PermissionAction,
  UserModulePermission,
  DataAccessScope,
  FinancialVisibilitySettings,
  UserApprovalLimits,
} from "@/types/database";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
  hasModuleAccess: (module: AppModule) => boolean;
  can: (module: AppModule, action: PermissionAction) => boolean;
  canViewFinancial: (key: keyof FinancialVisibilitySettings) => boolean;
  getDataScope: () => DataAccessScope;
  getApprovalLimit: (key: keyof UserApprovalLimits) => number | boolean;
  isAccessExpired: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  refreshUser: async () => {},
  hasModuleAccess: () => false,
  can: () => false,
  canViewFinancial: () => false,
  getDataScope: () => "own",
  getApprovalLimit: () => 0,
  isAccessExpired: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const u = await getCurrentUser();
      setUser(u);
    } catch (err: any) {
      if (err?.message !== "Request timed out") {
        console.warn("Failed to load authenticated user:", err?.message || err);
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        refreshUser();
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [refreshUser]);

  // Fast Memoized Permission Resolvers
  const isOwner = useMemo(() => {
    if (!user) return false;
    return (
      user.role === "owner" ||
      user.email.toLowerCase() === PRIMARY_OWNER_EMAIL.toLowerCase() ||
      user.id === "usr-owner-001"
    );
  }, [user]);

  const isAccessExpired = useMemo(() => {
    if (!user) return false;
    if (isOwner) return false;
    if (user.status === "expired") return true;
    if (user.access_expiry_date) {
      return new Date(user.access_expiry_date).getTime() < Date.now();
    }
    return false;
  }, [user, isOwner]);

  const effectivePermissions = useMemo<Record<AppModule, UserModulePermission>>(() => {
    if (!user) return {} as Record<AppModule, UserModulePermission>;
    if (user.permissions && Object.keys(user.permissions).length > 0) {
      return user.permissions;
    }
    return getDefaultPermissionsForRole(user.role || "viewer");
  }, [user]);

  const hasModuleAccess = useCallback(
    (module: AppModule): boolean => {
      if (!user) return false;
      if (isOwner) return true;
      if (isAccessExpired) return false;
      const perm = effectivePermissions[module];
      return Boolean(perm && perm.access);
    },
    [user, isOwner, isAccessExpired, effectivePermissions]
  );

  const can = useCallback(
    (module: AppModule, action: PermissionAction): boolean => {
      if (!user) return false;
      if (isOwner) return true;
      if (isAccessExpired) return false;

      const perm = effectivePermissions[module];
      if (!perm || !perm.access) return false;

      switch (action) {
        case "view":
          return Boolean(perm.can_view);
        case "create":
          return Boolean(perm.can_create);
        case "edit":
          return Boolean(perm.can_edit);
        case "delete":
          return Boolean(perm.can_delete);
        case "print":
          return Boolean(perm.can_print);
        case "export":
          return Boolean(perm.can_export);
        case "transfer_money":
          return Boolean(perm.can_transfer);
        case "manual_journal":
          return Boolean(perm.can_journal);
        case "reverse_transaction":
          return Boolean(perm.can_reverse);
        case "finalize":
          return Boolean(perm.can_finalize);
        case "record_payment":
          return Boolean(perm.can_record_payment);
        case "void":
          return Boolean(perm.can_void);
        case "view_bank_balance":
          return Boolean(perm.can_view_bank_balance);
        default:
          return false;
      }
    },
    [user, isOwner, isAccessExpired, effectivePermissions]
  );

  const canViewFinancial = useCallback(
    (key: keyof FinancialVisibilitySettings): boolean => {
      if (!user) return false;
      if (isOwner) return true;
      if (isAccessExpired) return false;
      if (user.financial_visibility && user.financial_visibility[key] !== undefined) {
        return Boolean(user.financial_visibility[key]);
      }
      const defaultVis = getDefaultFinancialVisibility(user.role || "viewer");
      return Boolean(defaultVis[key]);
    },
    [user, isOwner, isAccessExpired]
  );

  const getDataScope = useCallback((): DataAccessScope => {
    if (!user) return "own";
    if (isOwner) return "all";
    return user.data_scope || getDefaultDataScope(user.role || "viewer");
  }, [user, isOwner]);

  const getApprovalLimit = useCallback(
    (key: keyof UserApprovalLimits): number | boolean => {
      if (!user) return 0;
      if (isOwner) return key === "can_void_invoice" ? true : 10000000;
      if (user.approval_limits && user.approval_limits[key] !== undefined) {
        return user.approval_limits[key]!;
      }
      const defaultLimits = getDefaultApprovalLimits(user.role || "viewer");
      return defaultLimits[key];
    },
    [user, isOwner]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        refreshUser,
        hasModuleAccess,
        can,
        canViewFinancial,
        getDataScope,
        getApprovalLimit,
        isAccessExpired,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function usePermissions() {
  const {
    user,
    loading,
    hasModuleAccess,
    can,
    canViewFinancial,
    getDataScope,
    getApprovalLimit,
    isAccessExpired,
  } = useAuth();
  const role: UserRole = user?.role || "viewer";

  const isOwner =
    role === "owner" ||
    role === "admin" ||
    user?.email.toLowerCase() === PRIMARY_OWNER_EMAIL.toLowerCase() ||
    user?.id === "usr-owner-001";

  const isManager = role === "manager";
  const isAccountant = role === "accountant";
  const isReceptionist = role === "receptionist";
  const isMechanic = role === "mechanic";
  const isStorekeeper = role === "storekeeper";
  const isViewer = role === "viewer";

  return {
    user,
    role,
    loading,
    isOwner,
    isManager,
    isAccountant,
    isReceptionist,
    isMechanic,
    isStorekeeper,
    isViewer,
    hasModuleAccess,
    can,
    canViewFinancial,
    getDataScope,
    getApprovalLimit,
    isAccessExpired,
    canEdit: isOwner || isManager || Boolean(user?.permissions?.job_cards?.can_edit),
    canDelete: isOwner,
    canManageUsers: isOwner || hasModuleAccess("user_access"),
    canAccessSettings: isOwner || hasModuleAccess("settings"),
  };
}
