"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/api";
import { cn } from "@/components/ui";

const links = [
  { href: "/admin", label: "Pipeline" },
  { href: "/admin/discover", label: "Discover" },
  { href: "/admin/new", label: "Add" },
  { href: "/admin/calculator", label: "Calculator" },
  { href: "/admin/subcontractors", label: "Subcontractors" },
  { href: "/admin/rules", label: "Rules" },
  { href: "/admin/settings", label: "Settings" },
];

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
        <button type="button" onClick={() => void logout()} className="rounded-lg px-3 py-1.5 text-sm text-muted transition hover:bg-surface-2 hover:text-ink">
          Sign out
        </button>
      </div>
    </header>
  );
}
