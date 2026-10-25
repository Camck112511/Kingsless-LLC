import type { LocationMatch, Opportunity } from "@/engine/types";

/** An award notice: shows who already wins this kind of work (a possible route in as their subcontractor). */
export interface AwardLead {
  noticeId: string;
  title: string;
  agency: string;
  awardee: string;
  amountUsd: number | null;
  awardedOn: string | null;
  naics: string;
  url: string;
}

export interface DiscoveryResult {
  opportunities: Opportunity[];
  /** For each opportunity id: is it inside the owner's selected location? Computed by the engine. */
  areaMatch: Record<string, LocationMatch>;
  awards: AwardLead[];
  totalRecords: number;
  note: string;
}
