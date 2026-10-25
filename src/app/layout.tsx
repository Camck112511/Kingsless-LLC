import type { Metadata, Viewport } from "next";
import "./globals.css";
import { site } from "@/content/site";

/** The public address. Link previews and share images are built from it. NEXT_PUBLIC_SITE_URL overrides it. */
const siteUrl = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://kingsless.com");
  } catch {
    return new URL("https://kingsless.com"); // a malformed override must not break the build
  }
})();

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: { default: site.name, template: `%s | ${site.name}` },
  description: site.description,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#b4b7be" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
