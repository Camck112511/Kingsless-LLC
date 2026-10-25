import type { Metadata } from "next";
import { LoginForm } from "@/components/admin/login-form";
import { Card, Notice } from "@/components/ui";
import { adminStatus } from "@/server/views";

export const metadata: Metadata = { title: "Admin sign-in", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function LoginPage() {
  const cfg = adminStatus();
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center font-display text-2xl font-semibold">Kingsless LLC</p>
        <Card>
          <h1 className="mb-1 text-lg font-semibold">Admin sign-in</h1>
          <p className="mb-5 text-sm text-muted">Contract engine. Authorized use only.</p>
          {cfg.ok ? <LoginForm /> : <Notice tone="fail">{cfg.reason}</Notice>}
        </Card>
      </div>
    </main>
  );
}
