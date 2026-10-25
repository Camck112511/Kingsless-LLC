import "server-only";
/**
 * One place that talks to the Anthropic API for the console's AI features (scout, review, subcontractor research).
 *
 * Rules every caller inherits:
 *   - No ANTHROPIC_API_KEY, or any API error, returns { ok: false, error } with a plain-language message. Nothing throws
 *     into a route, and the rest of the console keeps working without AI.
 *   - Output is validated against a zod schema. With web search on, the model answers in JSON text (structured output
 *     cannot be combined with the search tool), which is parsed and validated the same way.
 *   - The addresses the search actually returned are collected, so callers can refuse any link the model invented.
 *   - Model: ANTHROPIC_MODEL, default claude-opus-5-5. Refusal fallbacks are not enabled.
 *
 * PROTECTED. See AGENTS.project.md.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

export type AiResult<T> = { ok: true; data: T; model: string; searchedUrls: string[]; searches: number } | { ok: false; error: string };

export interface AskOptions<S extends z.ZodType> {
  system: string;
  user: string;
  schema: S;
  /** Let the model search the web. `maxUses` bounds how many searches it may run (cost control). */
  webSearch?: { maxUses: number; country?: string };
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
}

export const aiConfigured = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY);

export function friendlyError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "ANTHROPIC_API_KEY was rejected. Check the key in your environment settings.";
  if (err instanceof Anthropic.PermissionDeniedError) return "Your Anthropic account is not allowed to use this feature (web search may need to be enabled in the Anthropic Console).";
  if (err instanceof Anthropic.RateLimitError) return "Anthropic rate limit reached. Wait a minute and try again.";
  if (err instanceof Anthropic.APIConnectionError) return "Could not reach the Anthropic API.";
  if (err instanceof Anthropic.APIError) return `Anthropic API error (${err.status}).`;
  return "The AI request failed.";
}

/** Pull the first JSON object or array out of model text (handles ```json fences and chatter around it). */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidates = [fenced?.[1], text].filter((x): x is string => typeof x === "string");
  for (const c of candidates) {
    const start = c.search(/[{[]/);
    if (start < 0) continue;
    const open = c[start]!;
    const close = open === "{" ? "}" : "]";
    for (let end = c.lastIndexOf(close); end > start; end = c.lastIndexOf(close, end - 1)) {
      try {
        return JSON.parse(c.slice(start, end + 1));
      } catch {
        /* try a shorter slice */
      }
    }
  }
  throw new Error("no JSON in model output");
}

export async function askJson<S extends z.ZodType>(opts: AskOptions<S>): Promise<AiResult<z.infer<S>>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "ANTHROPIC_API_KEY is not set. Add your Anthropic key to the environment to turn on AI features." };
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
  const client = new Anthropic({ apiKey, timeout: 280_000, maxRetries: 1 });
  const maxTokens = opts.maxTokens ?? 16_000;

  try {
    if (!opts.webSearch) {
      const response = await client.messages.parse({
        model,
        max_tokens: maxTokens,
        system: opts.system,
        messages: [{ role: "user", content: opts.user }],
        output_config: { effort: opts.effort ?? "medium", format: zodOutputFormat(opts.schema) },
      });
      if (response.stop_reason === "refusal") return { ok: false, error: "The AI declined this request." };
      if (response.parsed_output == null) return { ok: false, error: "The AI answer could not be read. Try again." };
      return { ok: true, data: response.parsed_output as z.infer<S>, model, searchedUrls: [], searches: 0 };
    }

    const messages: Anthropic.MessageParam[] = [{ role: "user", content: opts.user }];
    const searchedUrls = new Set<string>();
    let searches = 0;
    let text = "";
    for (let turn = 0; turn < 6; turn++) {
      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: opts.system,
        messages,
        output_config: { effort: opts.effort ?? "medium" },
        tools: [
          {
            type: "web_search_20260209",
            name: "web_search",
            max_uses: opts.webSearch.maxUses,
            user_location: { type: "approximate", country: opts.webSearch.country ?? "US" },
          },
        ],
      });
      for (const block of response.content) {
        if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
          for (const r of block.content) if (r.type === "web_search_result") searchedUrls.add(r.url);
        } else if (block.type === "server_tool_use" && block.name === "web_search") {
          searches += 1;
        }
      }
      if (response.stop_reason === "refusal") return { ok: false, error: "The AI declined this request." };
      if (response.stop_reason === "pause_turn") {
        // The server-side search loop hit its iteration limit; hand the turn back to continue it.
        messages.push({ role: "assistant", content: response.content });
        continue;
      }
      text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
      break;
    }
    if (!text) return { ok: false, error: "The AI search did not finish. Try again, or narrow what you asked for." };
    let parsed: unknown;
    try {
      parsed = extractJson(text);
    } catch {
      return { ok: false, error: "The AI answer could not be read. Try again." };
    }
    const checked = opts.schema.safeParse(parsed);
    if (!checked.success) return { ok: false, error: "The AI answer did not match the expected shape. Try again." };
    return { ok: true, data: checked.data as z.infer<S>, model, searchedUrls: [...searchedUrls], searches };
  } catch (err) {
    return { ok: false, error: friendlyError(err) };
  }
}
