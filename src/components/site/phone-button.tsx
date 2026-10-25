"use client";
import { useState, useTransition } from "react";
import { revealPhone } from "./phone-action";

const PhoneIcon = () => (
  <svg aria-hidden viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />
  </svg>
);

/** "Phone" button. Pressing it reveals the number as a tap-to-call link. */
export function PhoneButton({ className = "" }: { className?: string }) {
  const [phone, setPhone] = useState<{ display: string; tel: string } | null | undefined>(undefined);
  const [pending, start] = useTransition();

  return (
    <div aria-live="polite" className="inline-flex flex-col items-start gap-2">
      {phone ? (
        <a href={`tel:${phone.tel}`} className={`btn-gold inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold ${className}`}>
          <PhoneIcon /> {phone.display}
        </a>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => setPhone(await revealPhone()))}
          className={`inline-flex items-center gap-2 rounded-xl border border-accent/60 px-5 py-2.5 text-sm font-semibold text-accent transition hover:bg-accent-soft disabled:opacity-60 ${className}`}
        >
          <PhoneIcon /> {pending ? "One moment…" : "Phone"}
        </button>
      )}
      {phone === null && <p className="text-xs text-muted">The phone number isn&apos;t available right now. Please email us instead.</p>}
    </div>
  );
}
