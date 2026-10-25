import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/content/site";

export const metadata: Metadata = { title: "Services", description: "Project management, procurement support, and partner vetting." };

export default function ServicesPage() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
      <p className="text-sm font-medium uppercase tracking-widest text-accent">Services</p>
      <h1 className="mt-3 max-w-2xl font-display text-4xl font-semibold tracking-tight sm:text-5xl">What we take off your plate</h1>
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {site.services.map((s) => (
          <article key={s.title} className="flex flex-col rounded-[var(--radius-card)] border border-line bg-surface p-6">
            <h2 className="text-xl font-semibold">{s.title}</h2>
            <p className="mt-3 leading-relaxed text-muted">{s.body}</p>
            <ul className="mt-5 space-y-2 text-sm">
              {s.points.map((p) => (
                <li key={p} className="flex gap-2">
                  <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  {p}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <div className="mt-14 rounded-[var(--radius-card)] bg-surface-2 p-8 text-center">
        <p className="font-display text-2xl font-semibold">Have a job in mind?</p>
        <Link href="/contact" className="mt-5 inline-block rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-accent-ink transition hover:opacity-90">
          Get in touch
        </Link>
      </div>
    </section>
  );
}
