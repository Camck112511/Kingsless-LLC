import Image from "next/image";
import Link from "next/link";
import { site } from "@/content/site";

export default function HomePage() {
  const { hero } = site;
  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_60%_at_85%_20%,var(--accent-soft),transparent)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <p className="text-sm font-medium uppercase tracking-widest text-accent">{hero.eyebrow}</p>
            <h1 className="mt-4 font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-6xl">{hero.title}</h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">{hero.body}</p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link href={hero.primary.href} className="btn-gold rounded-xl px-6 py-3 text-sm font-semibold transition">
                {hero.primary.label}
              </Link>
              <Link href={hero.secondary.href} className="rounded-xl border border-line bg-surface px-6 py-3 text-sm font-semibold transition hover:bg-surface-2">
                {hero.secondary.label}
              </Link>
            </div>
          </div>
          <div className="relative">
            <div aria-hidden className="absolute -inset-6 rounded-[2rem] bg-[radial-gradient(closest-side,rgb(217_164_65/0.22),transparent)] blur-2xl" />
            <Image
              src="/brand/brand-card.jpg"
              alt="The Kingsless LLC logo: a gold XL monogram beside the silver KINGSLESS LLC wordmark, embossed on black"
              width={1024}
              height={600}
              priority
              sizes="(min-width: 1024px) 520px, 100vw"
              className="relative w-full rounded-2xl border border-line object-cover shadow-[0_30px_80px_-30px_rgb(0_0_0/0.9)]"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="font-display text-3xl font-semibold tracking-tight">How we are different</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {site.pillars.map((p) => (
            <article key={p.title} className="rounded-[var(--radius-card)] border border-line bg-surface p-6 transition hover:border-accent/50">
              <div aria-hidden className="mb-4 h-1 w-10 rounded-full bg-[linear-gradient(90deg,var(--gold-hi),var(--gold-lo))]" />
              <h3 className="text-lg font-semibold">{p.title}</h3>
              <p className="mt-3 leading-relaxed text-muted">{p.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-surface/50">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="font-display text-3xl font-semibold tracking-tight">How it works</h2>
          <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {site.steps.map((s, i) => (
              <li key={s.title} className="rounded-[var(--radius-card)] bg-surface p-6 ring-1 ring-line">
                <span className="btn-gold flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold">{i + 1}</span>
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
        <Link href="/contact" className="btn-gold mt-8 inline-block rounded-xl px-6 py-3 text-sm font-semibold transition">
          Contact us
        </Link>
      </section>
    </>
  );
}
