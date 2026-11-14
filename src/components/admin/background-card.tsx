"use client";
import { fmtDate } from "@/components/format";
import { Badge, Button, Card, CardTitle, Notice } from "@/components/ui";
import { resolveConflict, useCloud } from "@/lib/cloud";

/** Is the cloud copy on? Background mode lets autopilot submit, watch for awards and email you while the console is closed. */
export function BackgroundModeCard() {
  const c = useCloud();
  return (
    <Card>
      <CardTitle aside={<Badge tone={c.phase === "on" ? "pass" : c.phase === "conflict" || c.phase === "error" ? "fail" : "neutral"}>{c.phase === "on" ? "On" : c.phase === "off" ? "Off" : c.phase === "conflict" ? "Needs a choice" : c.phase === "error" ? "Problem" : "Checking…"}</Badge>}>Background mode (autopilot while you are away)</CardTitle>
      {c.phase === "on" && <p className="text-sm text-muted">Your data is saved to a private cloud copy{c.syncedAt ? ` (last saved ${fmtDate(c.syncedAt)})` : ""}. Autopilot checks your authorized bids on a schedule, even when this console is closed, and emails you when something needs you, a bid goes out, or you win.</p>}
      {c.phase === "off" && (
        <div className="space-y-2 text-sm text-muted">
          <p>Off. Autopilot still works, but only while this console is open (or when you press Run autopilot now), and it cannot email you or notice a win while you are away.</p>
          <p>To turn it on, the site needs a private cloud store (Vercel Blob) and a scheduled check (<code>CRON_SECRET</code>). It is a one-time setup on the server; see the README, “Background mode”.</p>
        </div>
      )}
      {c.phase === "conflict" && (
        <div className="space-y-3 text-sm">
          <Notice tone="unknown">{c.message}</Notice>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => void resolveConflict("cloud")}>Use the cloud copy</Button>
            <Button onClick={() => { if (window.confirm("Overwrite the cloud copy with what is in this browser?")) void resolveConflict("browser"); }}>Keep this browser&apos;s copy</Button>
          </div>
        </div>
      )}
      {c.phase === "error" && <Notice tone="fail">{c.message}</Notice>}
      {c.phase === "on" && c.message && <Notice tone="unknown" className="mt-3">{c.message}</Notice>}
    </Card>
  );
}
