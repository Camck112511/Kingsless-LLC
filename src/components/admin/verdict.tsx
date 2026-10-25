import type { GateStatus, Verdict, VerificationLabel } from "@/engine/types";
import { Badge } from "@/components/ui";

const verdictMeta: Record<Verdict, { label: string; tone: "fail" | "unknown" | "info" | "pass" }> = {
  reject: { label: "Reject", tone: "fail" },
  investigate: { label: "Investigate", tone: "unknown" },
  qualified: { label: "Qualified", tone: "info" },
  "bid-ready": { label: "Bid-ready", tone: "pass" },
};

export const verdictLabel = (v: Verdict): string => verdictMeta[v].label;

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const m = verdictMeta[verdict];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

const gateMeta: Record<GateStatus, { icon: string; tone: "pass" | "fail" | "unknown"; label: string }> = {
  pass: { icon: "✓", tone: "pass", label: "Pass" },
  fail: { icon: "✕", tone: "fail", label: "Fail" },
  unknown: { icon: "?", tone: "unknown", label: "Unproven" },
};

export function GateBadge({ status }: { status: GateStatus }) {
  const m = gateMeta[status];
  return (
    <Badge tone={m.tone}>
      <span aria-hidden>{m.icon}</span> {m.label}
    </Badge>
  );
}

const labelMeta: Record<VerificationLabel, { label: string; tone: "pass" | "unknown" | "neutral" }> = {
  verified: { label: "Verified", tone: "pass" },
  "partially-verified": { label: "Partially verified", tone: "unknown" },
  unverified: { label: "Unverified", tone: "neutral" },
};

export function VerificationBadge({ label }: { label: VerificationLabel }) {
  const m = labelMeta[label];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}
