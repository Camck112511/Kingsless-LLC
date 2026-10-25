import Image from "next/image";
import Link from "next/link";
import { site } from "@/content/site";
import { PhoneButton } from "./phone-button";

export function SiteFooter() {
  return (
    <footer className="bg-footer text-footer-ink">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Image src="/brand/logo-dark.webp" alt={site.name} width={1002} height={535} className="h-20 w-auto" />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-footer-muted">{site.tagline}</p>
        </div>
        <nav aria-label="Footer">
          <p className="text-xs font-semibold uppercase tracking-widest text-footer-muted">Company</p>
          <ul className="mt-4 space-y-2 text-sm">
            {site.nav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="transition hover:text-[var(--gold-hi)]">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-footer-muted">Contact</p>
          <ul className="mt-4 space-y-3 text-sm">
            {site.contactEmail && (
              <li>
                <a href={`mailto:${site.contactEmail}`} className="break-all transition hover:text-[var(--gold-hi)]">
                  {site.contactEmail}
                </a>
              </li>
            )}
            {site.hasPhone && (
              <li>
                <PhoneButton variant="onDark" />
              </li>
            )}
          </ul>
        </div>
      </div>
      <p className="border-t border-footer-line px-4 py-5 text-center text-xs text-footer-muted sm:px-6">
        &copy; {new Date().getFullYear()} {site.name}. All rights reserved.
      </p>
    </footer>
  );
}
