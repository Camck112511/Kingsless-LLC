/**
 * Location matching: is the place of performance inside the area the owner chose to work in?
 *
 * Unknown stays unknown: a listing that does not say where the work happens cannot be proven to be in your area.
 *
 * PROTECTED engine file.
 */
import type { LocationMatch, ServiceArea } from "./types";

export const US_STATES: ReadonlyArray<{ code: string; name: string }> = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" }, { code: "AZ", name: "Arizona" }, { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" }, { code: "CO", name: "Colorado" }, { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" }, { code: "FL", name: "Florida" }, { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" }, { code: "IL", name: "Illinois" }, { code: "IN", name: "Indiana" }, { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" }, { code: "LA", name: "Louisiana" }, { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" }, { code: "MA", name: "Massachusetts" }, { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" }, { code: "MO", name: "Missouri" }, { code: "MT", name: "Montana" }, { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" }, { code: "NJ", name: "New Jersey" }, { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" }, { code: "NC", name: "North Carolina" }, { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" }, { code: "OR", name: "Oregon" }, { code: "PA", name: "Pennsylvania" }, { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" }, { code: "TN", name: "Tennessee" }, { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" }, { code: "VT", name: "Vermont" }, { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" }, { code: "WI", name: "Wisconsin" }, { code: "WY", name: "Wyoming" },
  { code: "PR", name: "Puerto Rico" }, { code: "GU", name: "Guam" }, { code: "VI", name: "U.S. Virgin Islands" },
  { code: "AS", name: "American Samoa" }, { code: "MP", name: "Northern Mariana Islands" },
];

const CODES = new Set(US_STATES.map((s) => s.code));
const BY_NAME = new Map(US_STATES.map((s) => [s.name.toLowerCase(), s.code]));

/** "tx", "TX", "Texas" -> "TX". Anything unrecognised -> "" (unknown), never a guess. */
export function normState(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const up = t.toUpperCase().replace(/\./g, "");
  if (CODES.has(up)) return up;
  return BY_NAME.get(t.toLowerCase()) ?? "";
}

/** "City of Houston", "Liberty County" -> "houston", "liberty". */
export function placeKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b(city|town|village|county|parish|borough)\s+of\b/g, " ")
    .replace(/\b(county|parish|borough)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True if the listing's place (which may name several, e.g. "Houston; Dallas") matches the chosen place. */
export function placeMatches(listingPlace: string, chosenPlace: string): boolean {
  const chosen = placeKey(chosenPlace);
  if (!chosen) return false;
  return listingPlace
    .split(/[;/|]|\band\b/i)
    .map(placeKey)
    .filter(Boolean)
    .some((tok) => tok === chosen || ` ${tok} `.includes(` ${chosen} `) || ` ${chosen} `.includes(` ${tok} `));
}

export function describeArea(area: ServiceArea): string {
  if (area.scope === "anywhere") return "anywhere";
  const states = area.states.map(normState).filter(Boolean);
  const where = [area.places.length ? area.places.join(", ") : "", states.join(", ")].filter(Boolean).join(" · ");
  return where || "anywhere";
}

export function checkLocation(loc: { city: string; state: string }, area: ServiceArea): LocationMatch {
  const states = area.states.map(normState).filter(Boolean);
  const places = area.places.map(placeKey).filter(Boolean);
  if (area.scope === "anywhere" || (states.length === 0 && places.length === 0)) {
    return { status: "pass", detail: "No location restriction is selected.", question: null };
  }

  const st = normState(loc.state);
  const city = loc.city.trim();
  const where = [city, st].filter(Boolean).join(", ");

  if (states.length > 0) {
    if (!st) {
      return {
        status: "unknown",
        detail: `The listing does not say which state the work is in. You selected ${describeArea(area)}.`,
        question: "Where will the work be performed (city/county and state)?",
      };
    }
    if (!states.includes(st)) {
      return { status: "fail", detail: `The work is in ${where || st}, outside your selected location (${describeArea(area)}).`, question: null };
    }
  }

  if (places.length > 0) {
    if (!city) {
      return {
        status: "unknown",
        detail: `The state matches, but the city or county is not stated. You selected ${area.places.join(", ")}.`,
        question: "Which city or county will the work be performed in?",
      };
    }
    if (!area.places.some((p) => placeMatches(city, p))) {
      return { status: "fail", detail: `${where} is not among your selected places (${area.places.join(", ")}).`, question: null };
    }
  }

  return { status: "pass", detail: `The work is in ${where || "your selected state"}, inside your selected location.`, question: null };
}
