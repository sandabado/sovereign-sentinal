"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient, hasSupabaseBrowserConfig } from "@/lib/supabase/client";

export type ViewMode = "family" | "personal" | "business";
export type ProfileRole = "admin" | "adult" | "supervised" | "child";
export type HouseholdRole = "owner" | "admin" | "member" | "child" | "view_only";
export type EntityRelationship = "owner" | "trustee" | "beneficiary" | "authorized_signer" | "member";

export type HouseholdPermissions = {
  can_see_all: boolean;
  can_edit_finances: boolean;
  can_manage_entities: boolean;
};

export type UserProfile = {
  id: string;
  full_name: string;
  email: string;
  role: ProfileRole;
  avatar_url: string | null;
};

export type HouseholdMembership = {
  id: string;
  user_id: string;
  household_id: string;
  role: HouseholdRole;
  permissions: HouseholdPermissions;
};

export type HouseholdMember = UserProfile & {
  avatar_color: string;
  membership: HouseholdMembership;
};

export type HouseholdEntity = {
  id: string;
  name: string;
  type: string;
  ein: string | null;
  owner_id: string | null;
  relationship_type: EntityRelationship | null;
  ownership_percentage: number | null;
};

type StoredViewPreference = {
  mode: ViewMode;
  activeUserId: string | null;
};

type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  user: User | null;
  profile: UserProfile | null;
  membership: HouseholdMembership | null;
  householdMembers: HouseholdMember[];
  entities: HouseholdEntity[];
  activeHouseholdId: string | null;
  currentViewMode: ViewMode;
  activeUserId: string | null;
  switchViewMode: (mode: ViewMode) => void;
  setActiveUser: (userId: string | null) => void;
  isAdmin: boolean;
  canManageEntities: boolean;
  signOut: () => Promise<void>;
};

const EMPTY_PERMISSIONS: HouseholdPermissions = {
  can_see_all: false,
  can_edit_finances: false,
  can_manage_entities: false,
};

const DEMO_HOUSEHOLD_ID = "demo-household";
const VIEW_PREFERENCE_PREFIX = "sovereign:view-preference";

const DEMO_MEMBERS: HouseholdMember[] = [
  demoMember("demo-jesse", "Jesse", "admin", "owner", "#8b73ff"),
  demoMember("demo-shannon", "Shannon", "adult", "member", "#f0a858"),
  demoMember("demo-hakon", "Hakon", "child", "child", "#45b8a8"),
];

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const configured = hasSupabaseBrowserConfig();
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [membership, setMembership] = useState<HouseholdMembership | null>(null);
  const [householdMembers, setHouseholdMembers] = useState<HouseholdMember[]>(configured ? [] : DEMO_MEMBERS);
  const [entities, setEntities] = useState<HouseholdEntity[]>([]);
  const [activeHouseholdId, setActiveHouseholdId] = useState<string | null>(configured ? null : DEMO_HOUSEHOLD_ID);
  const [currentViewMode, setCurrentViewMode] = useState<ViewMode>("family");
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(configured);

  const clearAuthenticatedContext = useCallback(() => {
    setUser(null);
    setProfile(null);
    setMembership(null);
    setEntities([]);
    setCurrentViewMode("family");
    setActiveUserId(null);
    if (configured) {
      setHouseholdMembers([]);
      setActiveHouseholdId(null);
    } else {
      setHouseholdMembers(DEMO_MEMBERS);
      setActiveHouseholdId(DEMO_HOUSEHOLD_ID);
    }
  }, [configured]);

  const loadAuthenticatedContext = useCallback(async (authUser: User) => {
    if (!supabase) return;

    const fallbackProfile = profileFromUser(authUser);
    const [{ data: profileRow }, { data: membershipRows }] = await Promise.all([
      supabase.from("user_profiles").select("id, full_name, email, role, avatar_url").eq("id", authUser.id).maybeSingle(),
      supabase
        .from("household_memberships")
        .select("id, user_id, household_id, role, permissions")
        .eq("user_id", authUser.id)
        .order("created_at", { ascending: true })
        .limit(1),
    ]);

    const nextProfile = normalizeProfile(profileRow, fallbackProfile);
    const nextMembership = normalizeMembership(membershipRows?.[0]);
    const householdId = nextMembership?.household_id ?? null;
    let nextMembers: HouseholdMember[] = [standaloneMember(nextProfile, householdId)];

    if (householdId) {
      const { data: householdRows } = await supabase
        .from("household_memberships")
        .select("id, user_id, household_id, role, permissions")
        .eq("household_id", householdId);
      const memberships = (householdRows ?? []).map(normalizeMembership).filter(isPresent);
      const memberIds = memberships.map((item) => item.user_id);
      if (memberIds.length > 0) {
        const { data: profileRows } = await supabase
          .from("user_profiles")
          .select("id, full_name, email, role, avatar_url")
          .in("id", memberIds);
        const profilesById = new Map(
          (profileRows ?? []).map((row) => {
            const normalized = normalizeProfile(row, null);
            return [normalized.id, normalized] as const;
          }),
        );
        nextMembers = memberships.map((item) => {
          const memberProfile = profilesById.get(item.user_id) ?? (item.user_id === authUser.id ? nextProfile : unknownProfile(item.user_id));
          return { ...memberProfile, avatar_color: avatarColor(item.user_id), membership: item };
        });
      }
    }

    const permissions = nextMembership?.permissions ?? EMPTY_PERMISSIONS;
    const admin = nextProfile.role === "admin" || nextMembership?.role === "owner" || nextMembership?.role === "admin";
    const manageableEntities = admin || permissions.can_manage_entities;
    const visibleMemberIds = admin || permissions.can_see_all
      ? nextMembers.map((member) => member.id)
      : [authUser.id];
    const nextEntities = await loadEntities(supabase, visibleMemberIds, authUser.id);
    const defaultMode: ViewMode = isRestrictedProfile(nextProfile, nextMembership) ? "personal" : "family";
    const preference = readViewPreference(authUser.id);
    const preferredMode = preference && isAllowedMode(preference.mode, nextProfile, nextMembership, manageableEntities)
      ? preference.mode
      : defaultMode;
    const preferredMember = preference?.activeUserId && visibleMemberIds.includes(preference.activeUserId)
      ? preference.activeUserId
      : preferredMode === "personal" ? authUser.id : null;

    setProfile(nextProfile);
    setMembership(nextMembership);
    setHouseholdMembers(nextMembers);
    setEntities(nextEntities);
    setActiveHouseholdId(householdId);
    setCurrentViewMode(preferredMode);
    setActiveUserId(preferredMember);
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;

    let active = true;
    let requestId = 0;
    const syncUser = async (nextUser: User | null) => {
      const currentRequest = ++requestId;
      if (!active) return;
      setUser(nextUser);
      if (!nextUser) {
        clearAuthenticatedContext();
        setLoading(false);
        return;
      }
      await loadAuthenticatedContext(nextUser);
      if (active && requestId === currentRequest) setLoading(false);
    };

    void supabase.auth.getUser().then(({ data }) => syncUser(data.user));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncUser(session?.user ?? null);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [clearAuthenticatedContext, loadAuthenticatedContext, supabase]);

  const isAdmin = profile?.role === "admin" || membership?.role === "owner" || membership?.role === "admin";
  const canManageEntities = Boolean(isAdmin || membership?.permissions.can_manage_entities);

  const switchViewMode = useCallback((mode: ViewMode) => {
    if (mode === "business" && !canManageEntities) return;
    if (mode === "family" && isRestrictedProfile(profile, membership)) return;
    const nextActiveUserId = mode === "personal" ? activeUserId ?? user?.id ?? null : null;
    setCurrentViewMode(mode);
    setActiveUserId(nextActiveUserId);
    if (user) writeViewPreference(user.id, { mode, activeUserId: nextActiveUserId });
  }, [activeUserId, canManageEntities, membership, profile, user]);

  const selectActiveUser = useCallback((userId: string | null) => {
    if (!user) return;
    const canSeeAll = Boolean(isAdmin || membership?.permissions.can_see_all);
    const requestedUserId = userId ?? user.id;
    const nextUserId = canSeeAll && householdMembers.some((member) => member.id === requestedUserId)
      ? requestedUserId
      : user.id;
    setActiveUserId(nextUserId);
    setCurrentViewMode("personal");
    writeViewPreference(user.id, { mode: "personal", activeUserId: nextUserId });
  }, [householdMembers, isAdmin, membership, user]);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    clearAuthenticatedContext();
  }, [clearAuthenticatedContext, supabase]);

  const value = useMemo<AuthContextValue>(() => ({
    configured,
    loading,
    user,
    profile,
    membership,
    householdMembers,
    entities,
    activeHouseholdId,
    currentViewMode,
    activeUserId,
    switchViewMode,
    setActiveUser: selectActiveUser,
    isAdmin,
    canManageEntities,
    signOut,
  }), [
    activeHouseholdId,
    activeUserId,
    canManageEntities,
    configured,
    currentViewMode,
    entities,
    householdMembers,
    isAdmin,
    loading,
    membership,
    profile,
    selectActiveUser,
    signOut,
    switchViewMode,
    user,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function demoMember(id: string, name: string, profileRole: ProfileRole, householdRole: HouseholdRole, color: string): HouseholdMember {
  return {
    id,
    full_name: name,
    email: `${name.toLowerCase()}@sovereign.local`,
    role: profileRole,
    avatar_url: null,
    avatar_color: color,
    membership: {
      id: `membership-${id}`,
      user_id: id,
      household_id: DEMO_HOUSEHOLD_ID,
      role: householdRole,
      permissions: householdRole === "owner"
        ? { can_see_all: true, can_edit_finances: true, can_manage_entities: true }
        : EMPTY_PERMISSIONS,
    },
  };
}

function profileFromUser(user: User): UserProfile {
  const metadataName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";
  return {
    id: user.id,
    full_name: metadataName || user.email?.split("@")[0] || "Sovereign member",
    email: user.email ?? "",
    role: normalizeProfileRole(user.user_metadata?.role),
    avatar_url: typeof user.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : null,
  };
}

function normalizeProfile(value: unknown, fallback: UserProfile | null): UserProfile {
  const row = asRecord(value);
  return {
    id: asString(row.id) || fallback?.id || "unknown",
    full_name: asString(row.full_name) || fallback?.full_name || "Household member",
    email: asString(row.email) || fallback?.email || "",
    role: normalizeProfileRole(row.role ?? fallback?.role),
    avatar_url: asString(row.avatar_url) || fallback?.avatar_url || null,
  };
}

function normalizeMembership(value: unknown): HouseholdMembership | null {
  const row = asRecord(value);
  const id = asString(row.id);
  const userId = asString(row.user_id);
  const householdId = asString(row.household_id);
  if (!id || !userId || !householdId) return null;
  const rawPermissions = asRecord(row.permissions);
  return {
    id,
    user_id: userId,
    household_id: householdId,
    role: normalizeHouseholdRole(row.role),
    permissions: {
      can_see_all: rawPermissions.can_see_all === true,
      can_edit_finances: rawPermissions.can_edit_finances === true,
      can_manage_entities: rawPermissions.can_manage_entities === true,
    },
  };
}

function standaloneMember(profile: UserProfile, householdId: string | null): HouseholdMember {
  return {
    ...profile,
    avatar_color: avatarColor(profile.id),
    membership: {
      id: `standalone-${profile.id}`,
      user_id: profile.id,
      household_id: householdId ?? "",
      role: profile.role === "admin" ? "admin" : profile.role === "child" ? "child" : "member",
      permissions: EMPTY_PERMISSIONS,
    },
  };
}

function unknownProfile(id: string): UserProfile {
  return { id, full_name: "Household member", email: "", role: "adult", avatar_url: null };
}

async function loadEntities(supabase: SupabaseClient, memberIds: string[], currentUserId: string): Promise<HouseholdEntity[]> {
  if (memberIds.length > 0) {
    const { data: assignments } = await supabase
      .from("entity_assignments")
      .select("entity_id, user_id, relationship_type, ownership_percentage")
      .in("user_id", memberIds);
    const assignmentRows = assignments ?? [];
    const entityIds = [...new Set(assignmentRows.map((row) => asString(asRecord(row).entity_id)).filter(Boolean))];
    if (entityIds.length > 0) {
      const { data: entityRows } = await supabase.from("entities").select("id, name, type, ein, user_id").in("id", entityIds);
      const assignmentsByEntity = new Map(assignmentRows.map((row) => [asString(asRecord(row).entity_id), asRecord(row)]));
      return (entityRows ?? []).map((row) => normalizeEntity(row, assignmentsByEntity.get(asString(asRecord(row).id))));
    }
  }

  const { data: ownedRows } = await supabase
    .from("entities")
    .select("id, name, type, ein, user_id")
    .eq("user_id", currentUserId);
  return (ownedRows ?? []).map((row) => normalizeEntity(row, null));
}

function normalizeEntity(value: unknown, assignment: unknown): HouseholdEntity {
  const row = asRecord(value);
  const assignmentRow = asRecord(assignment);
  const ownership = Number(assignmentRow.ownership_percentage);
  return {
    id: asString(row.id),
    name: asString(row.name) || "Unnamed entity",
    type: asString(row.type) || "personal",
    ein: asString(row.ein) || null,
    owner_id: asString(row.owner_id) || asString(row.user_id) || null,
    relationship_type: normalizeRelationship(assignmentRow.relationship_type),
    ownership_percentage: Number.isFinite(ownership) ? ownership : null,
  };
}

function isRestrictedProfile(profile: UserProfile | null, membership: HouseholdMembership | null) {
  return profile?.role === "child" || profile?.role === "supervised" || membership?.role === "child";
}

function isAllowedMode(mode: ViewMode, profile: UserProfile, membership: HouseholdMembership | null, canManageEntities: boolean) {
  if (mode === "business") return canManageEntities;
  if (mode === "family") return !isRestrictedProfile(profile, membership);
  return true;
}

function readViewPreference(userId: string): StoredViewPreference | null {
  try {
    const raw = window.localStorage.getItem(`${VIEW_PREFERENCE_PREFIX}:${userId}`);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredViewPreference>;
    if (value.mode !== "family" && value.mode !== "personal" && value.mode !== "business") return null;
    return { mode: value.mode, activeUserId: typeof value.activeUserId === "string" ? value.activeUserId : null };
  } catch {
    return null;
  }
}

function writeViewPreference(userId: string, preference: StoredViewPreference) {
  try {
    window.localStorage.setItem(`${VIEW_PREFERENCE_PREFIX}:${userId}`, JSON.stringify(preference));
  } catch {
    // Private browsing or a locked-down browser can disable local storage.
  }
}

function avatarColor(id: string) {
  const colors = ["#8b73ff", "#f0a858", "#e57373", "#45b8a8", "#b276e8", "#df8f55"];
  const hash = [...id].reduce((total, character) => total + character.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

function normalizeProfileRole(value: unknown): ProfileRole {
  return value === "admin" || value === "supervised" || value === "child" ? value : "adult";
}

function normalizeHouseholdRole(value: unknown): HouseholdRole {
  return value === "owner" || value === "admin" || value === "child" || value === "view_only" ? value : "member";
}

function normalizeRelationship(value: unknown): EntityRelationship | null {
  return value === "owner" || value === "trustee" || value === "beneficiary" || value === "authorized_signer" || value === "member"
    ? value
    : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
