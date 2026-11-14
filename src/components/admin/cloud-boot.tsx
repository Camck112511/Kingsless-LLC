"use client";
import Link from "next/link";
import { useEffect } from "react";
import { Notice } from "@/components/ui";
import { startCloud, useCloud } from "@/lib/cloud";

/** Starts cloud sync once when the console opens, and shows a banner only when something needs the owner's attention. */
export function CloudBoot() {
  const c = useCloud();
  useEffect(() => startCloud(), []);
  if (c.phase === "conflict") {
    return (
      <Notice tone="unknown" className="mb-4">
        <strong>Two copies of your data exist.</strong> {c.message} <Link href="/admin/settings" className="font-medium underline">Choose which to keep in Settings</Link>.
      </Notice>
    );
  }
  if (c.phase === "error") {
    return <Notice tone="unknown" className="mb-4">Could not check the cloud copy: {c.message} Your work is still saved in this browser.</Notice>;
  }
  return null;
}
