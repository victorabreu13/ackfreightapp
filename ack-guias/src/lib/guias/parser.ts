import { extractGuia, type AiComplete } from "@/lib/guias/extract";

export type ParserProvider = "anthropic" | "openai";

export function parserProvider(env: NodeJS.ProcessEnv = process.env): ParserProvider {
  return env.AI_PARSER_PROVIDER === "openai" ? "openai" : "anthropic";
}

export function parserModel(env: NodeJS.ProcessEnv = process.env): string {
  if (env.AI_PARSER_MODEL?.trim()) return env.AI_PARSER_MODEL.trim();
  return parserProvider(env) === "openai" ? "gpt-4.1-mini" : "claude-sonnet-4-5";
}

async function anthropicComplete(prompt: string, apiKey: string, model: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) throw new Error(`AI parser HTTP ${response.status}`);
  const body = (await response.json()) as { content?: Array<{ text?: string }> };
  return body.content?.map((part) => part.text ?? "").join("\n") ?? "";
}

async function openaiComplete(prompt: string, apiKey: string, model: string): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) throw new Error(`AI parser HTTP ${response.status}`);
  const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return body.choices?.[0]?.message?.content ?? "";
}

export function completeFromEnv(env: NodeJS.ProcessEnv = process.env): AiComplete | null {
  const apiKey = env.AI_PARSER_API_KEY?.trim();
  if (!apiKey) return null;
  const model = parserModel(env);
  if (parserProvider(env) === "openai") return (prompt) => openaiComplete(prompt, apiKey, model);
  return (prompt) => anthropicComplete(prompt, apiKey, model);
}

export async function extractGuiaFromEnv(text: string, env: NodeJS.ProcessEnv = process.env) {
  return extractGuia(text, completeFromEnv(env));
}
