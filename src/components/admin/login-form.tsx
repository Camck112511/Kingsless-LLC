"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Input, Notice } from "@/components/ui";

export function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }), credentials: "same-origin" });
      if (res.ok) {
        router.replace("/admin");
        router.refresh();
        return;
      }
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setError(json.error ?? "Sign-in failed.");
    } catch {
      setError("Network error. Try again.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Admin password">
        <Input type="password" autoComplete="current-password" autoFocus required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {error && <Notice tone="fail">{error}</Notice>}
      <Button type="submit" variant="primary" className="w-full" disabled={busy || password.length === 0}>
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
