"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/api";
import { cn } from "@/components/ui";
import { startAutopilot, stopAutopilot } from "@/lib/cloud";
import { useAppState } from "@/lib/store";

const links = [
  { href: "/admin", label: "My bids" },
  { href: "/admin/scout", label: "Find bids" },
  { href: "/admin/new", label: "Add" },
  { href: "/admin/calculator", label: "Calculator" },
  { href: "/admin/subcontractors", label: "Subcontractors" },
  { href: "/admin/rules", label: "Rules" },
  { href: "/admin/settings", label: "Settings" },
];

/** Always visible: is autopilot running, and a one-tap Start / Stop. */
function AutopilotSwitch() {
  const state = useAppState();
  if (!state) return null;
  const on = !state.autopilotPaused;
  const needsYou = state.items.filter((i) => ["needs-you", "ready-to-upload"].includes(i.bid?.auto?.progress.phase ?? "")).length;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", on ? "bg-pass-soft text-pass" : "bg-surface-2 text-muted")} role="status">
        <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", on ? "bg-pass" : "bg-muted")} />
        Autopilot {on ? "running" : "stopped"}
        {needsYou > 0 && <span className="rounded-full bg-unknown-soft px-1.5 text-unknown">{needsYou} need{needsYou === 1 ? "s" : ""} you</span>}
      </span>
      {on ? (
        <button type="button" onClick={() => { if (window.confirm("Stop all autopilot activity? Nothing will run until you press Start.")) stopAutopilot(); }} className="rounded-lg border border-fail/40 px-3 py-1 text-xs font-medium text-fail transition hover:bg-fail-soft">Stop</button>
      ) : (
        <button type="button" onClick={() => startAutopilot()} className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-accent-ink transition hover:opacity-90">Start</button>
      )}
    </div>
  );
}

export function AdminNav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 sm:px-6">
        <Link href="/admin" className="mr-2 flex items-center gap-2.5 font-display text-lg font-semibold">
          <Image src="/brand/mark.webp" alt="" width={797} height={515} className="h-7 w-auto" />
          <span>
            Kingsless <span className="text-accent">Engine</span>
          </span>
        </Link>
        <nav aria-label="Admin" className="flex flex-1 flex-wrap items-center gap-1 text-sm">
          {links.map((l) => {
            const active = l.href === "/admin" ? path === "/admin" || path.startsWith("/admin/opportunities") : path.startsWith(l.href);
            return (
              <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined} className={cn("rounded-lg px-3 py-1.5 transition", active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-surface-2 hover:text-ink")}>
                {l.label}
              </Link>
            );
          })}
        </nav>
        <AutopilotSwitch />
        <button type="button" onClick={() => void logout()} className="rounded-lg px-3 py-1.5 text-sm text-muted transition hover:bg-surface-2 hover:text-ink">
          Sign out
        </button>
      </div>
    </header>
  );
}
