"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  LayoutGrid,
  Users2,
  Building2,
  Briefcase,
  Wrench,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Image from "next/image";

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  // păstrăm starea la refresh
  useEffect(() => {
    const v = localStorage.getItem("cb-sidebar-collapsed");
    if (v === "1") setCollapsed(true);
  }, []);
  useEffect(() => {
    localStorage.setItem("cb-sidebar-collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  const w = collapsed ? "w-14" : "w-64";

  return (
    <aside
      className={clsx(
        // notă: fără border, cu overflow-visible ca să nu taie dropdown-ul
        "shrink-0 bg-panel transition-[width] duration-200 ease-in-out relative flex h-full flex-col overflow-visible",
        w
      )}
    >
      {/* header logo + toggle (toggle în interiorul blocului de logo) */}
      <div className="p-3 sticky top-0 z-10 bg-panel">
        <div className={clsx("flex items-center", collapsed ? "justify-center" : "justify-between")}>
          {/* Logo */}
          <div
            className={clsx("relative group", collapsed && "w-7 h-7")}
            // când e collapsed: pe hover arătăm doar iconul de expand (nu logo+icon)
          >
            {!collapsed ? (
              <Image
                src="/assets/cbLogo.svg"
                alt="CoolBits"
                width={28}
                height={28}
                className="logo-dark-white"
                priority
              />
            ) : (
              <button
                aria-label="Expand sidebar"
                className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-panel-soft"
                onClick={() => setCollapsed(false)}
              >
                <ChevronRight className="size-4" />
              </button>
            )}
          </div>

          {/* Toggle – aliniat dreapta, apare doar când NU e collapsed */}
          {!collapsed && (
            <button
              aria-label="Collapse sidebar"
              className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-panel-soft"
              onClick={() => setCollapsed(true)}
              title="Collapse"
            >
              <ChevronLeft className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* New chat */}
      <div className="px-3">
        <button
          className={clsx(
            "w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-panel-soft text-sm",
            collapsed && "justify-center px-0"
          )}
        >
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-app/20">
            <svg viewBox="0 0 24 24" className="h-4 w-4">
              <path fill="currentColor" d="M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2h6z" />
            </svg>
          </span>
          {!collapsed && <span className="font-medium">New chat</span>}
        </button>
      </div>

      {/* nav */}
      <nav className="flex-1 overflow-y-auto">
        <Section title="Spaces" icon={<LayoutGrid className="size-4" />} collapsed={collapsed}>
          <NavItem label="Personal" icon={<Users2 className="size-4" />} collapsed={collapsed} />
          <NavItem label="Business" icon={<Building2 className="size-4" />} collapsed={collapsed} />
          <NavItem label="Agency" icon={<Briefcase className="size-4" />} collapsed={collapsed} />
          <NavItem label="DevOps" icon={<Wrench className="size-4" />} collapsed={collapsed} />
        </Section>

        <Section title="Recent" collapsed={collapsed}>
          <NavItem label="Onboarding flow (mock)" collapsed={collapsed} />
          <NavItem label="Cost dashboard (mock)" collapsed={collapsed} />
          <NavItem label="Gateway tests (mock)" collapsed={collapsed} />
        </Section>
      </nav>

      {/* user menu (lipit de bottom, dropdown funcțional, peste composer) */}
      <div className="px-3 pb-3 sticky bottom-0 z-[60] bg-panel">
        <UserMenu collapsed={collapsed} />
      </div>
    </aside>
  );
}

function Section({
  title,
  icon,
  collapsed,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  collapsed: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="px-3 py-2">
      {!collapsed && (
        <div className="flex items-center gap-2 px-2 py-1 text-xs uppercase tracking-wide text-muted">
          {icon}
          <span>{title}</span>
        </div>
      )}
      <div className={clsx("mt-1 space-y-1", collapsed && "space-y-2")}>{children}</div>
    </div>
  );
}

function NavItem({ label, icon, collapsed }: { label: string; icon?: React.ReactNode; collapsed: boolean }) {
  return (
    <button
      className={clsx(
        "w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm hover:bg-panel-soft text-foreground/90",
        collapsed && "justify-center px-0"
      )}
      title={collapsed ? label : undefined}
    >
      {icon}
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );
}

function UserMenu({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        aria-haspopup="menu"
        aria-expanded={open}
        className={clsx(
          "w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-panel-soft",
          collapsed && "justify-center px-0"
        )}
        onClick={() => setOpen((v) => !v)}
      >
        <div className="h-8 w-8 rounded-full bg-panel-soft" />
        {!collapsed && (
          <div className="min-w-0 text-left">
            <div className="text-sm font-medium truncate">Andy</div>
            <div className="text-xs text-muted truncate">andy@coolbits.ai · Plan: Plus</div>
          </div>
        )}
        {!collapsed && <ChevronDown className="size-4 ml-auto" />}
      </button>

      {open && (
        <div
          role="menu"
          className={clsx(
            "absolute z-[70] w-[220px] rounded-xl bg-panel shadow-xl p-2", // fără border, peste composer
            collapsed ? "bottom-12 left-1/2 -translate-x-1/2" : "bottom-12 left-0"
          )}
        >
          <MenuItem label="Upgrade plan" />
          <MenuItem label="Personalization" />
          <MenuItem label="Settings" />
          <MenuItem label="Help" />
          <MenuItem label="Log out" />
        </div>
      )}
    </div>
  );
}

function MenuItem({ label }: { label: string }) {
  return (
    <div className="px-2 py-1.5 text-sm rounded-md hover:bg-panel-soft cursor-pointer select-none">
      {label}
    </div>
  );
}
