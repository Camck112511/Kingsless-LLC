import Link from "next/link";
import { site } from "@/content/site";

export default function HomePage() {
  const { hero } = site;
  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_80%_0%,var(--accent-soft),transparent)]" />
        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <p className="text-sm font-medium uppercase tracking-widest text-accent">{hero.eyebrow}</p>
          <h1 className="mt-4 max-w-3xl font-display text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">{hero.title}</h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">{hero.body}</p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href={hero.primary.href} className="rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-accent-ink shadow-sm transition hover:opacity-90">
              {hero.primary.label}
            </Link>
            <Link href={hero.secondary.href} className="rounded-xl border border-line bg-surface px-6 py-3 text-sm font-semibold transition hover:bg-surface-2">
              {hero.secondary.label}
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="font-display text-3xl font-semibold tracking-tight">How we are different</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {site.pillars.map((p) => (
            <article key={p.title} className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
              <h3 className="text-lg font-semibold">{p.title}</h3>
              <p className="mt-3 leading-relaxed text-muted">{p.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-surface-2">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="font-display text-3xl font-semibold tracking-tight">How it works</h2>
          <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {site.steps.map((s, i) => (
              <li key={s.title} className="rounded-[var(--radius-card)] bg-surface p-6 ring-1 ring-line">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-ink">{i + 1}</span>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
        <h2 className="font-display text-3xl font-semibold tracking-tight">{site.contact.title}</h2>
        <p className="mx-auto mt-4 max-w-xl text-muted">{site.contact.body}</p>
        <Link href="/contact" className="mt-8 inline-block rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-accent-ink transition hover:opacity-90">
          Contact us
        </Link>
      </section>
    </>
  );
}
