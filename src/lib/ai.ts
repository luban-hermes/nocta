import "server-only";
import { env } from "./env";

/**
 * Minimal OpenAI-compatible Chat Completions client.
 * Works with OpenAI, DeepSeek, 通义千问 (DashScope compatible-mode), Moonshot, Ollama (/v1) ...
 */
export async function chat(messages: { role: "system" | "user" | "assistant"; content: string }[], opts: { json?: boolean; timeoutMs?: number; maxTokens?: number } = {}) {
  if (!env.aiEnabled) throw new Error("AI 未配置");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 25000);
  const call = async (withFormat: boolean) => {
    const res = await fetch(`${env.aiBaseUrl}/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
        ...(env.aiApiKey ? { authorization: `Bearer ${env.aiApiKey}` } : {}),
      },
      body: JSON.stringify({
        model: env.aiModel,
        messages,
        temperature: 0.2,
        max_tokens: opts.maxTokens ?? 600,
        ...(withFormat ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    return res;
  };
  try {
    let res = await call(!!opts.json);
    // some providers reject response_format — retry once without it
    if (!res.ok && opts.json && (res.status === 400 || res.status === 422)) res = await call(false);
    if (!res.ok) throw new Error(`AI 接口返回 ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content ?? "";
  } finally {
    clearTimeout(timer);
  }
}

/** ask for a JSON object; returns null on any failure so callers can fall back to rules */
export async function chatJSON<T = Record<string, unknown>>(system: string, user: string, maxTokens = 600): Promise<T | null> {
  if (!env.aiEnabled) return null;
  try {
    const out = await chat(
      [
        { role: "system", content: system + "\n只输出一个 JSON 对象，不要输出任何其他文字。" },
        { role: "user", content: user },
      ],
      { json: true, maxTokens },
    );
    const s = out;
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    return JSON.parse(s.slice(start, end + 1)) as T;
  } catch (e) {
    console.warn("[nocta] AI call failed, falling back to rules:", e instanceof Error ? e.message : e);
    return null;
  }
}
