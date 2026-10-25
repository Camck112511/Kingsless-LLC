import type { Metadata } from "next";
import { Icon } from "@/components/site/icons";
import { CtaBand, SectionHeading } from "@/components/site/section";
import { site } from "@/content/site";

export const metadata: Metadata = { title: "Services", description: "Project management, procurement support, and partner vetting." };

export default function ServicesPage() {
  return (
    <>
      <section className="border-b border-line bg-surface-2">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Services</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">What we take off your plate</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">{site.description}</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-6 md:grid-cols-3">
          {site.services.map((s) => (
            <article key={s.title} className="flex flex-col rounded-xl border border-line bg-surface p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <Icon name={s.icon} />
              </span>
              <h2 className="mt-5 text-xl font-semibold">{s.title}</h2>
              <p className="mt-2 leading-relaxed text-muted">{s.body}</p>
              <ul className="mt-6 space-y-2 border-t border-line pt-5 text-sm">
                {s.points.map((p) => (
                  <li key={p} className="flex gap-2.5">
                    <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    {p}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-surface-2">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <SectionHeading eyebrow="Process" title="How an engagement runs" />
          <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {site.steps.map((s, i) => (
              <li key={s.title} className="border-t-2 border-accent pt-5">
                <span className="text-sm font-bold tracking-widest text-accent">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-2 font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <CtaBand />
    </>
  );
}
