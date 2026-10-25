"use server";

/**
 * Hands out the public phone number only when a visitor presses the Phone button, so it never sits in the page's
 * HTML or JavaScript for scrapers to harvest. The number lives in the CONTACT_PHONE environment variable (hosting
 * dashboard), not in the repository.
 */
export async function revealPhone(): Promise<{ display: string; tel: string } | null> {
  const display = (process.env.CONTACT_PHONE ?? "").trim();
  const tel = display.replace(/[^\d+]/g, "");
  const digits = tel.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return { display, tel };
}
