import { Hono } from "hono";
import { z } from "zod";
import { HttpError, apiError, assertOrigin, jsonBody, rateLimit } from "./membership/http.js";
import { requireIdentity } from "./membership/identity.js";

export const DEFAULT_AZURE_ENDPOINT = "https://boblinh-resource.services.ai.azure.com/openai/v1/responses";
export const DEFAULT_AZURE_DEPLOYMENT = "gpt-5-mini";

const schema = z.object({
  messages: z.array(z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string().min(1).max(30000) }).strict()).min(1).max(24),
  stream: z.boolean().default(true),
}).strict().refine((body) => body.messages.reduce((sum, message) => sum + message.content.length, 0) <= 60000 && body.messages.some((message) => message.role === "user"));

export function azureEndpoint(env) {
  const url = new URL(env.AZURE_OPENAI_ENDPOINT || DEFAULT_AZURE_ENDPOINT);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.port ||
      !/\.(services\.ai\.azure\.com|openai\.azure\.com)$/.test(url.hostname) || url.pathname.replace(/\/$/, "") !== "/openai/v1/responses") {
    throw new HttpError(503, "Azure OpenAI endpoint configuration is invalid.", "provider_not_configured");
  }
  return url.href.replace(/\/$/, "");
}

export const azureAI = new Hono();
azureAI.onError(apiError);
azureAI.use("*", requireIdentity);

azureAI.get("/providers", (c) => c.json({ success: true, azure: {
  configured: Boolean(c.env.AZURE_OPENAI_API_KEY), deployment: c.env.AZURE_OPENAI_DEPLOYMENT || DEFAULT_AZURE_DEPLOYMENT,
} }));

azureAI.post("/azure/responses", async (c) => {
  assertOrigin(c);
  if (!c.env.AZURE_OPENAI_API_KEY) throw new HttpError(503, "Azure OpenAI is not configured yet.", "provider_not_configured");
  const body = await jsonBody(c, schema, 65536);
  await rateLimit(c.env, `azure-minute:${c.get("user").id}`, 6);
  await rateLimit(c.env, `azure-day:${c.get("user").id}`, 100, 86400);
  const instructions = body.messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
  const input = body.messages.filter((message) => message.role !== "system");
  let upstream;
  try {
    upstream = await fetch(azureEndpoint(c.env), {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": c.env.AZURE_OPENAI_API_KEY },
      body: JSON.stringify({ model: c.env.AZURE_OPENAI_DEPLOYMENT || DEFAULT_AZURE_DEPLOYMENT, instructions, input,
        stream: body.stream, store: false, max_output_tokens: 4096, reasoning: { effort: "low" } }),
      signal: AbortSignal.any([c.req.raw.signal, AbortSignal.timeout(90000)]),
    });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "Azure OpenAI could not be reached. Please try again.", "azure_unavailable");
  }
  if (!upstream.ok) {
    await upstream.body?.cancel();
    throw new HttpError(upstream.status === 429 ? 429 : 502, "Azure OpenAI is unavailable for this request. Please try again shortly.", upstream.status === 429 ? "azure_rate_limited" : "azure_request_failed");
  }
  if (body.stream) {
    if (!upstream.headers.get("content-type")?.includes("text/event-stream") || !upstream.body) throw new HttpError(502, "Azure did not return a response stream.", "azure_invalid_response");
    return new Response(upstream.body, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  }
  const result = await upstream.json();
  if (result.status !== "completed") throw new HttpError(502, "Azure could not finish this response.", "azure_incomplete_response");
  const outputText = result.output_text || (result.output || []).flatMap((item) => item.content || []).map((part) => part.text || part.refusal || "").join("");
  return c.json({ success: true, outputText });
});
