import Image from "next/image";
import { site } from "@/content/site";
import { PhoneButton } from "./phone-button";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface/40">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1fr_auto] md:items-center">
        <div className="flex items-center gap-4">
          <Image src="/brand/logo-dark.webp" alt={site.name} width={1002} height={535} className="h-16 w-auto" />
          <p className="max-w-xs text-sm text-muted">{site.tagline}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {site.contactEmail && (
            <a href={`mailto:${site.contactEmail}`} className="rounded-xl border border-line px-5 py-2.5 text-sm font-semibold transition hover:bg-surface-2">
              Email
            </a>
          )}
          {site.hasPhone && <PhoneButton />}
        </div>
      </div>
      <p className="border-t border-line px-4 py-4 text-center text-xs text-muted sm:px-6">
        &copy; {new Date().getFullYear()} {site.name}. All rights reserved.
      </p>
    </footer>
  );
}
