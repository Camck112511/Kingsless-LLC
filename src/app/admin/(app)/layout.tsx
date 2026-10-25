import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/nav";
import { requireAdmin } from "@/server/auth";

export const metadata: Metadata = { title: { default: "Engine", template: "%s | Engine" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    // data-theme="console" switches the whole page to the black-and-gold console theme (see globals.css)
    <div data-theme="console" className="min-h-dvh">
      <AdminNav />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
