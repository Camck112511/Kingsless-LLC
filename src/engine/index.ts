/**
 * Public surface of the engine. Server code imports from here.
 * UI code must NOT import values from the engine (types only); see AGENTS.project.md.
 */
export * from "./types";
export { DEFAULT_INPUTS, DEFAULT_PROFILE, DEFAULT_SETTINGS, EMPTY_TERMS, ENGINE_VERSION, RULES, ZERO_COSTS } from "./config";
export { analyze, analyzeAll, type AnalyzeItem, type World } from "./analyze";
export { calcPricing, marginFromMarkup, markupFromMargin, priceForMargin } from "./pricing";
export { simulateCash, customerPayments } from "./cashflow";
export { extractTerms, applyPatch, parseDate, type TermsPatch } from "./extract";
export { mergeAiFacts, quoteAppearsIn, AI_FIELDS, type AiFact, type AiMergeReport } from "./ai-merge";
export { generateScripts, longDate, type Script, type ScriptSet } from "./scripts";
export { newInputs, newOpportunity, newTerms } from "./factory";
export { TEST_CASE_OPPORTUNITIES, TEST_CASE_INPUTS } from "./seeds";
