import Image from "next/image";
import Link from "next/link";
import { site } from "@/content/site";

/**
 * The header bar is white in light mode and grey in dark mode, because the official logo has black letters and
 * needs a light bar to stay readable (see --header-bg in globals.css).
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-header-line bg-header text-header-ink">
      <div className="mx-auto flex h-[84px] max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label={`${site.name}, home`} className="shrink-0">
          <Image src="/brand/logo-official.webp" alt={site.name} width={1002} height={535} priority className="h-14 w-auto sm:h-16" />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 text-sm font-medium sm:gap-2">
          {site.nav.map((item) => (
            // the logo already links home, so "Home" is hidden on phones to keep the header from crowding
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-2 text-header-muted transition hover:bg-black/10 hover:text-header-ink max-[360px]:px-2 ${item.href === "/" ? "hidden sm:inline-flex" : ""}`}
            >
              {item.label}
            </Link>
          ))}
          <Link href="/contact" className="btn-dark ml-1 hidden rounded-md px-4 py-2 text-sm font-semibold transition sm:inline-flex">
            Get in touch
          </Link>
        </nav>
      </div>
    </header>
  );
}
