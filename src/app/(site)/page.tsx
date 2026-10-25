import Link from "next/link";
import { Icon } from "@/components/site/icons";
import { CtaBand, SectionHeading } from "@/components/site/section";
import { site } from "@/content/site";

export default function HomePage() {
  const { hero } = site;
  return (
    <>
      {/* Hero */}
      <section className="border-b border-line bg-surface-2">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">{hero.eyebrow}</p>
            <h1 className="mt-4 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl lg:text-[3.4rem]">{hero.title}</h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">{hero.body}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href={hero.primary.href} className="btn-gold rounded-md px-6 py-3 text-sm font-semibold transition">
                {hero.primary.label}
              </Link>
              <Link href={hero.secondary.href} className="rounded-md border border-line bg-surface px-6 py-3 text-sm font-semibold transition hover:border-accent hover:text-accent">
                {hero.secondary.label}
              </Link>
            </div>
          </div>

          {/* How one engagement runs */}
          <aside aria-label="How an engagement runs" className="rounded-xl border border-line bg-surface p-6 shadow-sm sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">How an engagement runs</p>
            <ol className="mt-5">
              {site.engagement.map((e, i) => (
                <li key={e.tag} className="relative flex gap-4 pb-6 last:pb-0">
                  {i < site.engagement.length - 1 && <span aria-hidden className="absolute left-[15px] top-9 h-[calc(100%-2.25rem)] w-px bg-line" />}
                  <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#14161c] text-xs font-bold text-[var(--gold-hi)]">{i + 1}</span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-accent">{e.tag}</p>
                    <p className="mt-0.5 font-semibold">{e.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{e.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </section>

      {/* Pillars */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionHeading eyebrow="Why Kingsless" title="Clear scope. Qualified partners. One point of accountability." />
        <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-3">
          {site.pillars.map((p) => (
            <article key={p.title} className="bg-surface p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <Icon name={p.icon} />
              </span>
              <h3 className="mt-5 text-lg font-semibold">{p.title}</h3>
              <p className="mt-2 leading-relaxed text-muted">{p.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Services summary */}
      <section className="border-y border-line bg-surface-2">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionHeading eyebrow="Services" title="What we take off your plate" />
            <Link href="/services" className="inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline">
              All services <Icon name="arrow" className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {site.services.map((s) => (
              <article key={s.title} className="rounded-xl border border-line bg-surface p-7">
                <Icon name={s.icon} className="h-7 w-7 text-accent" />
                <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 leading-relaxed text-muted">{s.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Process */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionHeading eyebrow="Process" title="How it works" />
        <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {site.steps.map((s, i) => (
            <li key={s.title} className="relative border-t-2 border-accent pt-5">
              <span className="text-sm font-bold tracking-widest text-accent">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-2 font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Standards */}
      <section className="border-y border-line bg-surface-2">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.1fr]">
          <SectionHeading eyebrow="Standards" title={site.standards.title} intro={site.standards.body} />
          <ul className="space-y-3">
            {site.standards.items.map((item) => (
              <li key={item} className="flex gap-3 rounded-lg border border-line bg-surface px-5 py-4">
                <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <CtaBand />
    </>
  );
}
