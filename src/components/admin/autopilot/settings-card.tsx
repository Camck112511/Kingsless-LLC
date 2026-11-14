"use client";
import { useState, useSyncExternalStore } from "react";
import { Badge, Button, Card, CardTitle, Notice } from "@/components/ui";
import { alertPermission, clearTopic, getTopic, newTopic, requestAlertPermission, sendTestAlert } from "@/lib/alerts";
import { setKeepAwake, startAutopilot, stopAutopilot, useCloud } from "@/lib/cloud";
import { useAppState } from "@/lib/store";
import { BackgroundModeCard } from "../background-card";

/** Everything about running autopilot, none of it needing an account or a key. */
export function AutopilotSettingsCard() {
  const state = useAppState();
  const cloud = useCloud();
  const [, bump] = useState(0);
  const refresh = () => bump((n) => n + 1);
  // Read straight from the browser's storage; empty on the server so the page hydrates cleanly.
  const topic = useSyncExternalStore(() => () => {}, getTopic, () => "");
  const perm = useSyncExternalStore(() => () => {}, alertPermission, () => "default" as const);
  const [test, setTest] = useState<string | null>(null);
  if (!state) return null;
  const on = !state.autopilotPaused;

  return (
    <div className="space-y-5">
      <Card>
        <CardTitle aside={<Badge tone={on ? "pass" : "neutral"}>{on ? "Running" : "Stopped"}</Badge>}>Autopilot: start and stop</CardTitle>
        <p className="text-sm text-muted">
          Autopilot only works on bids you authorized, within the limits you set. Start it and it checks them every 10 minutes while this console is open on any device; Stop it and nothing runs. Nothing needs setting up on the server.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {on ? <Button variant="danger" onClick={() => stopAutopilot()}>Stop autopilot</Button> : <Button variant="primary" onClick={() => startAutopilot()}>Start autopilot</Button>}
        </div>
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={cloud.keepAwake} onChange={(e) => void setKeepAwake(e.target.checked)} />
          <span>
            <span className="font-medium">Keep this screen awake while the console is open.</span>
            <span className="block text-xs text-muted">Leave the console open on a laptop, tablet or old phone that stays plugged in, and autopilot keeps checking even when you are away. It cannot run while every console tab is closed (that needs the optional cloud mode below). Run it from one device at a time.</span>
          </span>
        </label>
      </Card>

      <Card>
        <CardTitle>Alerts (free, no account)</CardTitle>
        <p className="mb-3 text-sm text-muted">Tells you when a bid goes out, needs you, is ready to send, or wins. Works while a console tab is open.</p>
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-medium">On this device</p>
            {perm === "unsupported" ? (
              <p className="text-xs text-muted">This browser does not support notifications.</p>
            ) : perm === "granted" ? (
              <p className="text-xs text-pass">Allowed. You will get a notification here.</p>
            ) : perm === "denied" ? (
              <p className="text-xs text-unknown">Blocked in your browser settings. Allow notifications for this site to turn them on.</p>
            ) : (
              <Button className="mt-1" onClick={async () => { await requestAlertPermission(); refresh(); }}>Allow notifications</Button>
            )}
          </div>
          <div>
            <p className="font-medium">On your phone (ntfy, free)</p>
            <p className="text-xs text-muted">Install the free <strong>ntfy</strong> app, tap +, and subscribe to the topic below. The push says only what happened to which bid: never an amount or a contact. The topic name is the only secret, so keep it private.</p>
            {topic ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="rounded bg-surface-2 px-2 py-1 text-xs">{topic}</code>
                <Button onClick={async () => setTest((await sendTestAlert()) ? "Sent. Check your phone." : "Could not reach ntfy.sh. Check your connection.")}>Send a test</Button>
                <Button variant="ghost" onClick={() => { clearTopic(); refresh(); setTest(null); }}>Turn off</Button>
              </div>
            ) : (
              <Button className="mt-2" onClick={() => { newTopic(); refresh(); }}>Turn on phone alerts</Button>
            )}
            {test && <p className="mt-1 text-xs text-muted">{test}</p>}
          </div>
        </div>
      </Card>

      <details className="rounded-[var(--radius-card)] border border-line bg-surface">
        <summary className="cursor-pointer px-5 py-4 text-base font-semibold tracking-tight">Optional: keep working while every tab is closed</summary>
        <div className="space-y-3 px-5 pb-5">
          <Notice tone="neutral">You do not need this. It needs a cloud store on the server, which takes a few minutes of setup in Vercel. Skip it unless you want autopilot to run with nothing open.</Notice>
          <BackgroundModeCard />
        </div>
      </details>
    </div>
  );
}
