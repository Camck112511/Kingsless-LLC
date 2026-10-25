"use server";

import { PUBLIC_PHONE } from "@/content/phone";

/**
 * Hands out the public phone number only when a visitor presses the Phone button, so it never sits in the page's
 * HTML or JavaScript for scrapers to harvest. The number is in content/phone.ts; the CONTACT_PHONE environment
 * variable (hosting dashboard), when set, takes precedence.
 *
 * A malformed value (letters, too few or too many digits) is refused rather than "cleaned up": quietly dropping a
 * mistyped character would publish a WRONG number on the site.
 */
export async function revealPhone(): Promise<{ display: string; tel: string } | null> {
  // A CONTACT_PHONE that is set but malformed is refused, not replaced by the default: showing a number the owner did
  // not intend is worse than showing none.
  const display = (process.env.CONTACT_PHONE ?? "").trim() || PUBLIC_PHONE;
  if (!/^\+?[\d\s().-]+$/.test(display)) return null; // digits, spaces, ( ) . - and an optional leading +
  const tel = display.replace(/[^\d+]/g, "");
  const digits = tel.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return { display, tel };
}
