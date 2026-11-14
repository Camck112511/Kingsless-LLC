import "server-only";
/**
 * The autopilot pass. For every bid the owner authorized, it reads the official solicitation, fills what it can prove,
 * prices the bid, checks every rule, and then does exactly one of: email the bid (when the listing takes email and every
 * check passes), prepare it and tell the owner to upload it, ask the owner for what only they can supply, or stop. After a
 * bid goes in it watches for the result, and on a win it builds the briefing and ranks the subcontractors to sell it to.
 *
 * Everything outside the process (web, AI, SAM, email) comes in through `Deps`, so the whole pass is testable offline.
 * The pass is idempotent: running it twice in a row sends nothing twice and repeats no notification.
 *
 * PROTECTED. See AGENTS.project.md.
 */
import { analyze, bidEmailFor, buildBidPackage, buildWinBriefing, decide, emptyBid, rankSubs } from "@/engine";
import { RULES } from "@/engine/config";
import { marketPrice } from "@/engine/scenarios";
import type { AutoBid, AutoEvent, AutoEventKind, BidRecord, Opportunity, Subcontractor, WinBriefing } from "@/engine/types";
import { recommendPrice } from "@/engine/price-strategy";
import { staffingCheck } from "@/engine/autopilot";
import { applyPatch } from "@/lib/patches";
import type { AppState, Patch, PipelineItem } from "@/lib/types";
import type { SubResearchResult } from "../ai/sub-research";
import { buildPacketPdf } from "../docs/package";
import type { OutboundEmail, SendResult } from "../email/resend";
import type { AwardQuery, MarketStats, PastAward, SubAwardee } from "../sources/usaspending";
import type { AwardCheck } from "./award-watch";
import { pageSignal } from "./award-watch";
import { consoleUrl, winEmail } from "./notify";
import type { OfficialRead, Refined } from "./official";

export interface Deps {
  now: () => Date;
  aiEnabled: boolean;
  /** Email sending (Resend) is set up. */
  emailEnabled: boolean;
  read: (opp: Opportunity) => Promise<OfficialRead>;
  refine: (opp: Opportunity, text: string, aiEnabled: boolean, today: string) => Promise<Refined>;
  comps: (q: AwardQuery) => Promise<{ awards: PastAward[]; stats: MarketStats }>;
  subawards: (q: AwardQuery) => Promise<SubAwardee[]>;
  research: (opp: Opportunity, settings: AppState["settings"]) => Promise<SubResearchResult | { error: string }>;
  award: (opp: Opportunity, company: string, now: Date) => Promise<AwardCheck>;
  send: (mail: OutboundEmail) => Promise<SendResult>;
  notify: (settings: AppState["settings"], subject: string, text: string) => Promise<boolean>;
  /** Called right after a bid is emailed so the record is saved before anything else can fail. */
  checkpoint?: (state: AppState, patches: Patch[]) => Promise<void>;
  /** Stop starting new bids after this time. */
  deadline?: number;
}

export interface RunResult {
  state: AppState;
  patches: Patch[];
  processed: number;
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);
const words = (title: string): string[] => [...new Set(title.toLowerCase().match(/[a-z]{5,}/g) ?? [])].filter((w) => !["services", "service", "contract", "annual", "county", "project", "program"].includes(w)).slice(0, 3);
const staleDays = (since: string | null, today: string, days: number): boolean => since === null || (Date.parse(today) - Date.parse(since.slice(0, 10))) / 86_400_000 >= days;
const hashKey = (s: string): string => {
  let h = 0x811c9dc5;
  for (const ch of s) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
};

const blankProgress = (): AutoBid["progress"] => ({ phase: "authorized", lastRunAt: null, summary: "", needs: [], notifiedKey: "", pageHash: "", subResearchAt: null, compsAt: null, pricing: null });

function toSubcontractor(l: Extract<SubResearchResult, { subs: unknown }>["subs"][number], opp: Opportunity, idSeed: string): Subcontractor {
  return {
    id: `sub-${idSeed}`,
    name: l.name,
    contact: [l.phone && `Phone: ${l.phone}`, l.email && `Email: ${l.email}`, l.website && `Web: ${l.website}`].filter(Boolean).join("\n"),
    services: l.services,
    coverage: [l.state, l.city].filter(Boolean),
    licenses: l.licenses.map((name) => ({ name, verifiedOn: null })),
    insuranceCoverageUsd: null,
    insuranceCertOnFile: false,
    bondingCapacityUsd: null,
    certifications: [],
    similarProjects: l.similarWork ? [{ description: l.similarWork, year: null, referenceVerified: false }] : [],
    capacityConfirmed: false,
    willingToSubcontract: "unknown",
    notes: `Found by AI web research for "${opp.title}". ${l.whyFits} Source: ${l.sourceUrl}. Nothing verified: confirm license, insurance, capacity and willingness before relying on them.`,
  };
}

export async function runAutopilot(startState: AppState, deps: Deps, only?: { itemId?: string; briefingOnly?: boolean }): Promise<RunResult> {
  const now = deps.now();
  const today = iso(now);
  let working: AppState = structuredClone(startState);
  const patches: Patch[] = [];
  let seq = 0;
  let processed = 0;
  const nid = (p: string) => `${p}-${now.getTime().toString(36)}-${(seq++).toString(36)}`;

  const event = (itemId: string | null, kind: AutoEventKind, title: string, detail: string): void => {
    const e: AutoEvent = { id: nid("evt"), at: now.toISOString(), itemId, kind, title, detail };
    const p: Patch = { id: nid("p"), at: now.toISOString(), kind: "event", event: e };
    patches.push(p);
    working = applyPatch(working, p);
  };
  const addSubs = (subs: Subcontractor[]): void => {
    for (const sub of subs) {
      const p: Patch = { id: nid("p"), at: now.toISOString(), kind: "sub", sub };
      const before = working.subcontractors.length;
      working = applyPatch(working, p);
      if (working.subcontractors.length > before) patches.push(p);
    }
  };
  const commit = (item: PipelineItem, baseUpdatedAt: string): PipelineItem => {
    const next: PipelineItem = { ...item, updatedAt: new Date(now.getTime() + seq).toISOString() };
    const p: Patch = { id: nid("p"), at: now.toISOString(), kind: "item", itemId: item.opportunity.id, baseUpdatedAt, item: next };
    patches.push(p);
    working = applyPatch(working, p);
    return next;
  };
  const notifyOnce = async (progress: AutoBid["progress"], key: string, subject: string, text: string): Promise<void> => {
    if (progress.notifiedKey === key) return;
    progress.notifiedKey = key;
    await deps.notify(working.settings, subject, text).catch(() => false);
  };

  const submissionsToday = () => working.events.filter((e) => e.kind === "submitted" && e.at.slice(0, 10) === today).length;

  /** Build the win briefing (research + federal records + ranking) and tell the owner. Returns the briefing; the caller stores it. */
  async function makeBriefing(cur: PipelineItem): Promise<WinBriefing> {
    const opp = cur.opportunity;
    const world = () => ({ settings: working.settings, subcontractors: working.subcontractors, quotes: working.quotes.filter((q) => q.opportunityId === opp.id), today });
    let webLeads: Array<{ name: string; services: string[]; city: string; state: string; website: string | null; phone: string | null; email: string | null; licenses: string[]; similarWork: string | null; sourceUrl: string }> = [];
    if (deps.aiEnabled) {
      const r = await deps.research(opp, working.settings);
      if (!("error" in r)) {
        webLeads = r.subs;
        addSubs(r.subs.map((l) => toSubcontractor(l, opp, hashKey(`${opp.id}|${l.name}`))));
      } else event(opp.id, "info", "Subcontractor research did not run", r.error);
    }
    const q: AwardQuery = { keywords: words(opp.title), naics: opp.naics ? [opp.naics] : [], states: opp.location.state.length === 2 ? [opp.location.state.toUpperCase()] : [], yearsBack: 3, limit: 50 };
    const federalLeads = (q.keywords.length + q.naics.length > 0 ? await deps.subawards(q).catch(() => [] as SubAwardee[]) : []).map((s) => ({ name: s.name, count: s.count, totalUsd: s.totalUsd, latest: s.latest, states: s.states, uei: s.uei }));
    const a = analyze({ opportunity: opp, inputs: cur.inputs }, world());
    const ranked = rankSubs({ opp, today, candidates: a.candidates, subs: working.subcontractors, webLeads, federalLeads });
    const briefing = buildWinBriefing({ opp, analysis: a, inputs: cur.inputs, bid: cur.bid ?? emptyBid(), settings: working.settings, today, ranked });
    event(opp.id, "won", briefing.headline, `${ranked.length} subcontractor${ranked.length === 1 ? "" : "s"} ranked. Open the bid workspace for the briefing.`);
    const mail = winEmail(briefing, opp.id);
    await deps.notify(working.settings, mail.subject, mail.text).catch(() => false);
    return briefing;
  }

  async function processItem(item: PipelineItem): Promise<void> {
    const base = item.updatedAt;
    let cur: PipelineItem = structuredClone(item);
    const bid: BidRecord = cur.bid ?? emptyBid();
    const auto = bid.auto;
    if (!auto) return;
    const auth = auto.auth;
    const progress: AutoBid["progress"] = { ...blankProgress(), ...auto.progress };
    const opp = cur.opportunity;
    const id = opp.id;
    const finish = (extra: Partial<BidRecord> = {}, status?: PipelineItem["status"]): void => {
      progress.lastRunAt = now.toISOString();
      cur = commit({ ...cur, ...(status ? { status } : {}), bid: { ...bid, ...extra, auto: { auth, progress } } }, base);
    };

    // ----- a result is already recorded (briefings for wins are handled before this function runs)
    if (bid.outcome) return;
    if (only?.briefingOnly) return;

    // ----- submitted: watch for the result
    if (bid.submission) {
      const page = await deps.read(opp);
      const company = working.settings.contact.companyName;
      let outcome: BidRecord["outcome"] = null;
      const aw = await deps.award(opp, company, now);
      if (aw.status === "won" || aw.status === "lost") {
        outcome = { result: aw.status, decidedOn: today, awardUsd: aw.status === "won" ? bid.submission.priceUsd : null, note: aw.detail };
        event(id, aw.status === "won" ? "won" : "lost", aw.status === "won" ? `Won: ${opp.title}` : `Lost: ${opp.title}`, aw.detail);
      } else if (page.ok && pageSignal(page.text, company)) {
        event(id, "award", "The agency's page names you near an award", "Open the official listing and confirm, then record the result.");
        await notifyOnce(progress, `signal:${page.hash}`, `Check this: the agency page for ${opp.title} may name you`, `The official listing now mentions ${company} near an award word. Open it, confirm, and record the result.\n\n${opp.sourceUrl}\n\n${consoleUrl(id)}`);
      } else if (aw.status === "error") {
        progress.summary = aw.detail;
      }
      if (page.ok) progress.pageHash = page.hash;
      if (outcome) {
        cur = { ...cur, status: outcome.result === "won" ? "won" : "lost" };
        bid.outcome = outcome;
        if (outcome.result === "won") {
          cur = { ...cur, bid: { ...bid, outcome } };
          progress.phase = "won";
          progress.summary = "Won. The briefing is ready.";
          const briefing = await makeBriefing(cur);
          finish({ outcome, briefing }, "won");
        } else {
          progress.phase = "lost";
          await notifyOnce(progress, `lost:${today}`, `Lost: ${opp.title}`, aw.detail);
          finish({ outcome }, "lost");
        }
        return;
      }
      progress.phase = "watching";
      if (!progress.summary || aw.status !== "error") progress.summary = "Bid submitted. Watching for the result.";
      finish();
      return;
    }

    // ----- not submitted yet
    // 1. Read the official solicitation.
    const page = await deps.read(opp);
    let opportunity = opp;
    let discovered: string | null = null;
    if (page.ok) {
      if (progress.pageHash && progress.pageHash !== page.hash) event(id, "info", "The official listing changed", `${opp.title}: the agency changed the page. Autopilot re-read it; check for an amendment.`);
      const refined = await deps.refine(opp, page.text, deps.aiEnabled, today);
      opportunity = { ...refined.opportunity, provenance: { ...refined.opportunity.provenance, verified: true, checkedOn: today, note: `Confirmed by the owner when authorizing autopilot; re-read from the official page on ${today}.` } };
      discovered = refined.discoveredEmail;
      if (refined.learned.length) event(id, "info", `Read the official solicitation for ${opp.title}`, `Found: ${refined.learned.slice(0, 6).join("; ")}.`);
      progress.pageHash = page.hash;
    } else {
      opportunity = { ...opp, provenance: { ...opp.provenance, verified: true } };
      progress.summary = page.error ?? "";
    }
    cur = { ...cur, opportunity };
    let inputs = cur.inputs;

    // 2. No expected price in the listing: use federal comparables if there are enough of them.
    if (marketPrice(opportunity, inputs) === null && staleDays(progress.compsAt, today, RULES.autopilot.researchEveryDays)) {
      const q: AwardQuery = { keywords: words(opportunity.title), naics: opportunity.naics ? [opportunity.naics] : [], states: opportunity.location.state.length === 2 ? [opportunity.location.state.toUpperCase()] : [], yearsBack: 3, limit: 50 };
      if (q.keywords.length + q.naics.length > 0) {
        const c = await deps.comps(q).catch(() => null);
        progress.compsAt = today;
        if (c && c.stats.count >= RULES.autopilot.compsMinCount && c.stats.medianUsd !== null) {
          inputs = { ...inputs, marketPriceUsd: c.stats.medianUsd };
          event(id, "price", `Used federal comparables as the expected price for ${opportunity.title}`, `The median of ${c.stats.count} similar federal contracts is $${c.stats.medianUsd.toLocaleString("en-US")}. Federal prices are a guide, not a quote.`);
        }
      }
    }
    cur = { ...cur, inputs };

    // 3. Too few plausible subcontractors on file: research some (at most weekly).
    const world = () => ({ settings: working.settings, subcontractors: working.subcontractors, quotes: working.quotes.filter((q) => q.opportunityId === id), today });
    let a0 = analyze({ opportunity: cur.opportunity, inputs: cur.inputs }, world());
    if (!staffingCheck(cur.opportunity, a0, working.subcontractors).ok && deps.aiEnabled && staleDays(progress.subResearchAt, today, RULES.autopilot.researchEveryDays)) {
      const r = await deps.research(cur.opportunity, working.settings);
      progress.subResearchAt = today;
      if ("error" in r) event(id, "info", "Subcontractor research did not run", r.error);
      else {
        addSubs(r.subs.map((l) => toSubcontractor(l, cur.opportunity, hashKey(`${id}|${l.name}`))));
        event(id, "info", `Found subcontractor candidates for ${opportunity.title}`, `${r.subs.length} added to your directory as unverified leads.`);
      }
      a0 = analyze({ opportunity: cur.opportunity, inputs: cur.inputs }, world());
    }

    // 4. Choose the price.
    const pr = recommendPrice({ opportunity: cur.opportunity, inputs: cur.inputs }, world(), { floorUsd: auth.floorUsd, ceilingUsd: auth.ceilingUsd });
    let priceNote = "";
    if (pr.choice) {
      if (cur.inputs.plannedBidUsd !== pr.choice.priceUsd) {
        event(id, "price", `Chose a bid price for ${opportunity.title}`, `$${pr.choice.priceUsd.toLocaleString("en-US")}: ${pr.choice.note}`);
      }
      cur = { ...cur, inputs: { ...cur.inputs, plannedBidUsd: pr.choice.priceUsd } };
      progress.pricing = pr.choice;
    } else {
      progress.pricing = null;
      priceNote = pr.reason;
    }

    // 5. Decide.
    const analysis = analyze({ opportunity: cur.opportunity, inputs: cur.inputs }, world());
    const pkg = buildBidPackage({ opp: cur.opportunity, analysis, inputs: cur.inputs, bid: { ...bid, auto: { auth, progress } }, settings: working.settings, today });
    const decision = decide({ item: { opportunity: cur.opportunity, inputs: cur.inputs }, bid: { ...bid, auto: { auth, progress } }, analysis, pkg, subs: working.subcontractors, emailConfigured: deps.emailEnabled, submissionsToday: submissionsToday(), discoveredEmail: discovered });
    const needs = priceNote && !decision.needs.includes(priceNote) && decision.action === "needs-you" ? [priceNote, ...decision.needs] : decision.needs;

    switch (decision.action) {
      case "submit": {
        const to = decision.recipient!;
        const mail = bidEmailFor(cur.opportunity, working.settings);
        const owner = working.settings.contact.email.trim();
        const packet = await buildPacketPdf(pkg, `${working.settings.contact.companyName || "Bid"} ${cur.opportunity.solicitationNumber || cur.opportunity.title}`.slice(0, 60));
        const sent = await deps.send({ to, bcc: owner && owner.toLowerCase() !== to.toLowerCase() ? owner : undefined, replyTo: owner || undefined, subject: mail.subject, text: mail.message, attachments: [{ filename: packet.filename, data: packet.data }] });
        if (!sent.ok) {
          progress.phase = "authorized";
          progress.summary = `Could not email the bid: ${sent.error}`;
          event(id, "error", `Could not send the bid for ${opportunity.title}`, sent.error);
          await notifyOnce(progress, `senderr:${hashKey(sent.error)}`, `Could not send the bid for ${opportunity.title}`, `${sent.error}\n\nIt will try again on the next pass, or you can send it yourself: ${consoleUrl(id)}`);
          finish();
          return;
        }
        const submission = { submittedOn: today, method: "console-email" as const, confirmation: sent.id, priceUsd: cur.inputs.plannedBidUsd, note: `Emailed automatically to ${to} by autopilot.` };
        progress.phase = "submitted";
        progress.summary = `Bid emailed to ${to} on ${today}.`;
        progress.needs = [];
        event(id, "submitted", `Submitted the bid for ${opportunity.title}`, `Emailed to ${to} at $${cur.inputs.plannedBidUsd?.toLocaleString("en-US")}. Confirmation ${sent.id}.`);
        await notifyOnce(progress, `submitted:${sent.id}`, `Bid submitted: ${opportunity.title}`, `Autopilot emailed your bid to ${to} at $${cur.inputs.plannedBidUsd?.toLocaleString("en-US")}.\nConfirmation ${sent.id}. You were copied.\n\nIt will watch for the result and tell you if you win.\n${consoleUrl(id)}`);
        finish({ submission }, "bid-submitted");
        if (deps.checkpoint) await deps.checkpoint(working, patches);
        return;
      }
      case "ready-to-upload":
        progress.phase = "ready-to-upload";
        progress.summary = decision.summary;
        progress.needs = needs;
        event(id, "ready", `Bid ready to upload: ${opportunity.title}`, decision.summary);
        await notifyOnce(progress, `ready:${cur.inputs.plannedBidUsd}`, `Bid ready to upload: ${opportunity.title}`, `${decision.summary}\n\nPrice $${cur.inputs.plannedBidUsd?.toLocaleString("en-US")}. Due ${cur.opportunity.dueDate ?? "(no date)"}.\nOpen the workspace, download the packet and upload it through the agency's portal, then record it:\n${consoleUrl(id)}`);
        finish();
        return;
      case "needs-you":
        progress.phase = "needs-you";
        progress.summary = decision.summary;
        progress.needs = needs;
        event(id, "needs-you", `Autopilot needs you: ${opportunity.title}`, needs.join(" "));
        await notifyOnce(progress, `needs:${hashKey(needs.join("|"))}`, `Autopilot needs you: ${opportunity.title}`, `${needs.map((n) => `- ${n}`).join("\n")}\n\n${consoleUrl(id)}`);
        finish();
        return;
      case "stop":
        progress.phase = "stopped";
        progress.summary = decision.summary;
        progress.needs = [];
        event(id, "stopped", `Autopilot dropped: ${opportunity.title}`, decision.summary);
        await notifyOnce(progress, `stop:${hashKey(decision.summary)}`, `Autopilot dropped: ${opportunity.title}`, `${decision.summary}\n\nNothing was submitted.\n${consoleUrl(id)}`);
        finish();
        return;
      case "expire":
        progress.phase = "expired";
        progress.summary = decision.summary;
        event(id, "stopped", `Missed the deadline: ${opportunity.title}`, decision.summary);
        await notifyOnce(progress, `expire:${today}`, `Missed the deadline: ${opportunity.title}`, `${decision.summary}\n\nNothing was submitted.\n${consoleUrl(id)}`);
        finish();
        return;
      case "wait":
        progress.summary = decision.summary;
        finish();
        return;
    }
  }

  for (const item of startState.items) {
    if (deps.deadline !== undefined && now.getTime() > deps.deadline) break;
    if (only?.itemId && item.opportunity.id !== only.itemId) continue;
    // Always work from the freshest copy (an earlier pass may have changed shared state).
    const fresh = working.items.find((i) => i.opportunity.id === item.opportunity.id) ?? item;
    const bid = fresh.bid ?? emptyBid();
    try {
      // A recorded win gets its briefing, whoever recorded it and whether or not autopilot was involved.
      if (bid.outcome?.result === "won" && !bid.briefing) {
        const base = fresh.updatedAt;
        const briefing = await makeBriefing(fresh);
        const auto = bid.auto ? { ...bid.auto, progress: { ...bid.auto.progress, phase: "won" as const, summary: "Won. The briefing is ready.", needs: [], lastRunAt: now.toISOString() } } : bid.auto;
        commit({ ...fresh, bid: { ...bid, briefing, auto } }, base);
        processed += 1;
        continue;
      }
      const auto = bid.auto;
      if (!auto || only?.briefingOnly) continue;
      if (working.autopilotPaused || auto.auth.paused) continue;
      const phase = auto.progress.phase;
      if (phase === "stopped" || phase === "expired" || phase === "lost" || phase === "won") continue;
      await processItem(fresh);
      processed += 1;
    } catch (err) {
      event(item.opportunity.id, "error", `Autopilot hit a problem with ${item.opportunity.title}`, err instanceof Error ? err.message.slice(0, 300) : "Unknown error.");
    }
  }
  return { state: working, patches, processed };
}
