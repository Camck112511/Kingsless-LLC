import Link from "next/link";
import { site } from "@/content/site";
import { Icon } from "./icons";

export function SectionHeading({ eyebrow, title, intro, className = "" }: { eyebrow: string; title: string; intro?: string; className?: string }) {
  return (
    <div className={`max-w-2xl ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {intro && <p className="mt-4 text-lg leading-relaxed text-muted">{intro}</p>}
    </div>
  );
}

/** Closing call-to-action band, charcoal in both light and dark mode. */
export function CtaBand() {
  return (
    <section className="bg-footer text-footer-ink">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center">
        <div className="max-w-xl">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{site.contact.title}</h2>
          <p className="mt-3 leading-relaxed text-footer-muted">{site.contact.body}</p>
        </div>
        <Link href="/contact" className="btn-gold inline-flex shrink-0 items-center gap-2 rounded-md px-6 py-3 text-sm font-semibold transition">
          Contact us <Icon name="arrow" className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
