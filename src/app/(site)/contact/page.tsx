import type { Metadata } from "next";
import { site } from "@/content/site";

export const metadata: Metadata = { title: "Contact", description: "Tell us what you need done." };

export default function ContactPage() {
  const email = site.contactEmail;
  const subject = encodeURIComponent("Project inquiry");
  const body = encodeURIComponent("What is the work?\n\nWhere is it?\n\nWhen do you need it done?\n");
  return (
    <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
      <p className="text-sm font-medium uppercase tracking-widest text-accent">Contact</p>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-5xl">{site.contact.title}</h1>
      <p className="mt-6 text-lg leading-relaxed text-muted">{site.contact.body}</p>

      <div className="mt-10 rounded-[var(--radius-card)] border border-line bg-surface p-8">
        {email ? (
          <>
            <p className="text-sm text-muted">Email</p>
            <a href={`mailto:${email}?subject=${subject}&body=${body}`} className="mt-1 block break-all font-display text-2xl font-semibold text-accent underline-offset-4 hover:underline">
              {email}
            </a>
            <p className="mt-6 text-sm text-muted">Please include what the work is, where it is, and when you need it done.</p>
          </>
        ) : (
          <p className="text-muted">Contact details are being finalized. Please check back shortly.</p>
        )}
      </div>
    </section>
  );
}
