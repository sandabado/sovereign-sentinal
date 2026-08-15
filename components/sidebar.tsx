"use client";

import {
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Repeat2,
  Settings,
  Sparkles,
  Users,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Overview", icon: LayoutDashboard, href: "/" },
  { label: "Calendar", icon: CalendarDays, href: "/calendar" },
  { label: "Debt Conductor", icon: CreditCard, href: "/debt" },
  { label: "Entities", icon: Building2, href: "/entities" },
  { label: "Subscriptions", icon: Repeat2, href: "/subscriptions" },
  { label: "Settings", icon: Settings, href: "/settings" },
];

export function Sidebar() {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [memberMenuOpen, setMemberMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const {
    user,
    profile,
    membership,
    householdMembers,
    entities,
    currentViewMode,
    activeUserId,
    switchViewMode,
    setActiveUser,
    isAdmin,
    canManageEntities,
    signOut,
  } = useAuth();

  const ownMember = householdMembers.find((member) => member.id === user?.id);
  const activeMember = householdMembers.find((member) => member.id === activeUserId) ?? ownMember;
  const restrictedToPersonal = profile?.role === "child" || profile?.role === "supervised" || membership?.role === "child";

  const changeMode = (mode: "family" | "personal" | "business") => {
    switchViewMode(mode);
    setMemberMenuOpen(false);
  };

  const changeMember = (memberId: string) => {
    setActiveUser(memberId);
    setMemberMenuOpen(false);
    setOpen(false);
  };

  const exit = async () => {
    setSigningOut(true);
    await signOut();
    router.replace("/auth/login");
    router.refresh();
  };

  return (
    <>
      <button
        className="fixed left-4 top-4 z-50 grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-[var(--surface)] text-[var(--ink)] shadow-xl lg:hidden"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Close navigation" : "Open navigation"}
      >
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>
      {open && (
        <button
          className="fixed inset-0 z-30 bg-black/55 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Close navigation"
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[268px] flex-col overflow-y-auto border-r border-white/[0.06] bg-[#131019]/95 px-4 py-6 backdrop-blur-xl transition-transform duration-300 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-10 items-center gap-3 px-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--purple)] text-sm font-black text-white shadow-[0_8px_24px_rgba(139,115,255,.3)]">
            S
          </div>
          <div>
            <p className="text-[0.96rem] font-bold tracking-[0.14em]">SOVEREIGN</p>
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.17em] text-[var(--muted)]">Financial OS</p>
          </div>
        </div>

        {user && (
          <div className="mt-7 rounded-2xl border border-white/[0.06] bg-black/10 p-1.5" aria-label="Financial view">
            {!restrictedToPersonal && (
              <button
                type="button"
                onClick={() => changeMode("family")}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition",
                  currentViewMode === "family"
                    ? "bg-[var(--purple)] text-white shadow-[0_6px_18px_rgba(139,115,255,.18)]"
                    : "text-[var(--muted)] hover:bg-white/[0.04] hover:text-[var(--ink)]",
                )}
                aria-pressed={currentViewMode === "family"}
              >
                <Users size={15} aria-hidden="true" />
                Family view
              </button>
            )}
            <button
              type="button"
              onClick={() => changeMode("personal")}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition",
                currentViewMode === "personal"
                  ? "bg-[var(--purple)] text-white shadow-[0_6px_18px_rgba(139,115,255,.18)]"
                  : "text-[var(--muted)] hover:bg-white/[0.04] hover:text-[var(--ink)]",
              )}
              aria-pressed={currentViewMode === "personal"}
            >
              <Wallet size={15} aria-hidden="true" />
              {activeMember && activeMember.id !== user.id ? `${activeMember.full_name}'s finances` : "My finances"}
            </button>
            {canManageEntities && (
              <button
                type="button"
                onClick={() => changeMode("business")}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition",
                  currentViewMode === "business"
                    ? "bg-[var(--purple)] text-white shadow-[0_6px_18px_rgba(139,115,255,.18)]"
                    : "text-[var(--muted)] hover:bg-white/[0.04] hover:text-[var(--ink)]",
                )}
                aria-pressed={currentViewMode === "business"}
              >
                <Building2 size={15} aria-hidden="true" />
                Entity watch
                {entities.length > 0 && <span className="ml-auto rounded-full bg-white/10 px-1.5 py-0.5 text-[0.58rem]">{entities.length}</span>}
              </button>
            )}
          </div>
        )}

        <nav className={cn("mt-7", !user && "mt-10")} aria-label="Main navigation">
          <p className="eyebrow mb-3 px-3">Command center</p>
          <ul className="space-y-1">
            {navItems.map(({ label, icon: Icon, href }) => {
              const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return <li key={label}>
                <Link
                  href={href}
                  onClick={() => {
                    setOpen(false);
                    setMemberMenuOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition",
                    isActive
                      ? "bg-[var(--purple)] text-white shadow-[0_8px_24px_rgba(139,115,255,.18)]"
                      : "text-[var(--muted)] hover:bg-white/[0.04] hover:text-[var(--ink)]",
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
                  {label}
                </Link>
              </li>
            })}
          </ul>
        </nav>

        <div className="mt-auto space-y-3">
          {user && isAdmin && householdMembers.length > 1 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMemberMenuOpen((value) => !value)}
                className="flex w-full items-center gap-2.5 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3 text-left transition hover:bg-white/[0.04]"
                aria-expanded={memberMenuOpen}
                aria-haspopup="menu"
              >
                <MemberAvatar member={activeMember} fallback="F" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold">{activeMember?.full_name ?? "Family"}</span>
                  <span className="block text-[0.61rem] text-[var(--muted)]">Viewing member</span>
                </span>
                <ChevronDown size={14} className={cn("text-[var(--muted)] transition", memberMenuOpen && "rotate-180")} aria-hidden="true" />
              </button>
              {memberMenuOpen && (
                <div className="absolute bottom-[calc(100%+.45rem)] left-0 right-0 z-10 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#1b1721] p-1.5 shadow-2xl" role="menu">
                  {householdMembers.map((member) => {
                    const selected = activeMember?.id === member.id && currentViewMode === "personal";
                    return (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => changeMember(member.id)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs transition",
                          selected ? "bg-[rgba(139,115,255,.12)] text-white" : "text-[var(--muted)] hover:bg-white/[0.04] hover:text-white",
                        )}
                        role="menuitem"
                      >
                        <MemberAvatar member={member} fallback="?" small />
                        <span className="min-w-0 flex-1 truncate font-semibold">{member.full_name}</span>
                        <span className="text-[0.54rem] font-semibold uppercase tracking-wider text-[var(--muted)]">{member.membership.role}</span>
                        {selected && <Check size={12} className="text-[var(--purple-bright)]" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {user && (
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3">
              <div className="flex items-center gap-2.5">
                <MemberAvatar member={ownMember} fallback={<UserRound size={14} />} />
                <div className="min-w-0">
                  <p className="text-[0.62rem] text-[var(--muted)]">Signed in{profile?.role ? ` · ${profile.role}` : ""}</p>
                  <p className="truncate text-xs font-semibold">{profile?.full_name || user.email || "Authenticated user"}</p>
                </div>
                <button onClick={exit} disabled={signingOut} className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--muted)] transition hover:bg-white/[0.05] hover:text-white disabled:opacity-50" aria-label="Sign out"><LogOut size={14} /></button>
              </div>
            </div>
          )}
          <div className="rounded-2xl border border-[rgba(139,115,255,.18)] bg-[rgba(139,115,255,.07)] p-4">
            <div className="mb-4 flex items-center justify-between">
              <Sparkles size={16} className="text-[var(--purple-bright)]" />
              <span className="rounded-full bg-white/[0.06] px-2 py-1 text-[0.62rem] font-semibold uppercase tracking-wider text-[var(--muted)]">Foundation</span>
            </div>
            <p className="text-xs font-medium text-[var(--muted)]">Sovereignty score</p>
            <div className="mt-2 flex items-end justify-between">
              <p className="text-3xl font-semibold tracking-tight">0<span className="text-lg text-[var(--purple-bright)]">%</span></p>
              <p className="mb-1 text-xs text-[var(--muted)]">Begin your path</p>
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.08]">
              <div className="h-full w-[4%] rounded-full bg-[var(--purple)]" />
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function MemberAvatar({
  member,
  fallback,
  small = false,
}: {
  member: ReturnType<typeof useAuth>["householdMembers"][number] | undefined;
  fallback: React.ReactNode;
  small?: boolean;
}) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full text-[0.65rem] font-bold text-white",
        small ? "h-6 w-6" : "h-8 w-8",
        !member && "bg-white/[0.05] text-[var(--muted)]",
      )}
      style={member ? { backgroundColor: member.avatar_color } : undefined}
      aria-hidden="true"
    >
      {member?.full_name.charAt(0).toUpperCase() || fallback}
    </span>
  );
}
