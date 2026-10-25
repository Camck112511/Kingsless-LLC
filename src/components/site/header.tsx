import Image from "next/image";
import Link from "next/link";
import { site } from "@/content/site";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label={`${site.name}, home`} className="flex shrink-0 items-center gap-2.5 sm:gap-3">
          <Image src="/brand/mark.webp" alt="" width={797} height={515} priority className="h-8 w-auto max-[360px]:h-7 sm:h-10" />
          <span className="flex flex-col leading-none">
            <span className="text-silver text-base font-extrabold max-[360px]:text-sm sm:text-xl uppercase italic tracking-[0.06em]">Kingsless</span>
            <span className="mt-0.5 self-end text-[10px] font-bold uppercase italic tracking-[0.3em] text-muted">LLC</span>
          </span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-0.5 text-sm sm:gap-2">
          {site.nav.map((item) => (
            // the logo already links home, so "Home" is hidden on phones to keep the header from crowding
            <Link key={item.href} href={item.href} className={`rounded-lg px-2.5 py-2 max-[360px]:px-1.5 text-muted transition hover:bg-surface-2 hover:text-ink sm:px-3 ${item.href === "/" ? "hidden sm:inline-flex" : ""}`}>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
