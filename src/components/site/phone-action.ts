"use server";

/**
 * Hands out the public phone number only when a visitor presses the Phone button, so it never sits in the page's
 * HTML or JavaScript for scrapers to harvest. The number lives in the CONTACT_PHONE environment variable (hosting
 * dashboard), not in the repository.
 *
 * A malformed value (letters, too few or too many digits) is refused rather than "cleaned up": quietly dropping a
 * mistyped character would publish a WRONG number on the site.
 */
export async function revealPhone(): Promise<{ display: string; tel: string } | null> {
  const display = (process.env.CONTACT_PHONE ?? "").trim();
  if (!/^\+?[\d\s().-]+$/.test(display)) return null; // digits, spaces, ( ) . - and an optional leading +
  const tel = display.replace(/[^\d+]/g, "");
  const digits = tel.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return { display, tel };
}
