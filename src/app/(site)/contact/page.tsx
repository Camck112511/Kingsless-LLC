import type { Metadata } from "next";
import { Icon } from "@/components/site/icons";
import { PhoneButton } from "@/components/site/phone-button";
import { site } from "@/content/site";

export const metadata: Metadata = { title: "Contact", description: "Tell us what you need done." };

export default function ContactPage() {
  const email = site.contactEmail;
  const subject = encodeURIComponent("Project inquiry");
  const body = encodeURIComponent("What is the work?\n\nWhere is it?\n\nWhen do you need it done?\n");
  return (
    <>
      <section className="border-b border-line bg-surface-2">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Contact</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">{site.contact.title}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">{site.contact.body}</p>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6 md:grid-cols-[1.2fr_1fr]">
        <div className="rounded-xl border border-line bg-surface p-8">
          <h2 className="text-lg font-semibold">Reach us</h2>
          <div className="mt-6 grid gap-8 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted">Email</p>
              <a href={`mailto:${email}?subject=${subject}&body=${body}`} className="mt-1 block break-all font-semibold text-accent underline-offset-4 hover:underline">
                {email}
              </a>
            </div>
            {site.hasPhone && (
              <div>
                <p className="mb-2 text-sm text-muted">Phone</p>
                <PhoneButton />
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface-2 p-8">
          <h2 className="text-lg font-semibold">Please include</h2>
          <ul className="mt-5 space-y-3 text-sm">
            {["What the work is", "Where it is", "When you need it done", "Any licensing, insurance or compliance requirements"].map((t) => (
              <li key={t} className="flex gap-2.5">
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
