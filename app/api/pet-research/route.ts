import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { getGoogleCseCredentials } from "@/lib/googleCseConfig";
import { getClientIp, isRateLimited } from "@/lib/security/rateLimit";
import { hasSensitiveData } from "@/lib/security/privacy";

type SearchItem = {
  title: string;
  link: string;
  displayLink: string;
  snippet: string;
};

function sanitizeQuery(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 200) return "";
  return trimmed
    .replace(/[^a-zA-Z0-9\u0900-\u097F\s.,?\-()]/g, "")
    .slice(0, 160);
}

function cleanText(value: unknown, maxLen: number) {
  return String(value ?? "")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, maxLen);
}

function toGeminiItems(answerText: string, q: string): SearchItem[] {
  const lines = answerText
    .split(/\n+/)
    .map((line) => line.replace(/^[\-\*\d\.\)\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 8);

  return lines.map((line, idx) => ({
    title: `Gemini insight ${idx + 1}`,
    link: `https://ai.google.dev/?q=${encodeURIComponent(q)}#${idx + 1}`,
    displayLink: "ai.google.dev",
    snippet: cleanText(line, 400),
  }));
}

/** Stable default: 1.5 Flash is removed from many v1 catalogs — see https://ai.google.dev/gemini-api/docs/models */
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

function parseRetrySeconds(message: string) {
  const a = message.match(/retry in\s+(\d+(?:\.\d+)?)s/i);
  if (a?.[1]) return Math.ceil(Number(a[1]));
  const b = message.match(/"retryDelay":"(\d+)s"/i);
  if (b?.[1]) return Number(b[1]);
  return 30;
}

function isGeminiAuthError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("api_key_invalid") ||
    normalized.includes("api key not valid") ||
    normalized.includes("permission_denied") ||
    normalized.includes("401") ||
    normalized.includes("403")
  );
}

async function fetchGoogleCseItems(safeQ: string, apiKey: string, cx: string): Promise<SearchItem[]> {
  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("cx", cx);
  url.searchParams.set("q", safeQ);
  url.searchParams.set("num", "8");

  const upstream = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!upstream.ok) {
    throw new Error(`Google CSE error (${upstream.status})`);
  }
  const data = (await upstream.json()) as {
    items?: { title?: string; link?: string; snippet?: string; displayLink?: string }[];
  };

  return (data.items ?? []).slice(0, 8).map((item) => ({
    title: cleanText(item.title, 200),
    link: cleanText(item.link, 500),
    displayLink: cleanText(item.displayLink, 200),
    snippet: cleanText(item.snippet, 400),
  }));
}

async function fetchOpenWebFallbackItems(request: Request, safeQ: string): Promise<{ provider: string; items: SearchItem[] }> {
  const url = new URL(request.url);
  url.pathname = "/api/search";
  url.search = "";
  url.searchParams.set("q", safeQ);
  const upstream = await fetch(url.toString(), { cache: "no-store" });
  if (!upstream.ok) {
    throw new Error(`Open web fallback error (${upstream.status})`);
  }
  const data = (await upstream.json()) as { provider?: string; items?: SearchItem[] };
  return { provider: data.provider ?? "open-web", items: data.items ?? [] };
}

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const limit = isRateLimited(`pet-research:${ip}`, 18, 60_000);
  if (limit.limited) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many research requests. Slow down and retry." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }
  const { searchParams } = new URL(request.url);
  const safeQ = sanitizeQuery(searchParams.get("q") ?? "");
  const provider = (searchParams.get("provider") ?? "google").toLowerCase();
  const intent = (searchParams.get("intent") ?? "research").toLowerCase();

  if (!safeQ) {
    return NextResponse.json({ error: "invalid_query", message: "Query is empty or invalid." }, { status: 400 });
  }
  if (hasSensitiveData(safeQ)) {
    return NextResponse.json(
      { error: "blocked_sensitive_query", message: "Remove personal info (email/phone/payment ids) before AI/web research." },
      { status: 400 }
    );
  }

  const geminiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  const { apiKey, cx } = getGoogleCseCredentials();
  const hasGoogleCse = Boolean(apiKey && cx);
  console.log(
    `[pet-research] Checking API Keys... Gemini: ${geminiKey ? "Found" : "Missing"}, Google: ${hasGoogleCse ? "Found" : "Missing"}`
  );

  if (provider === "gemini") {
    if (!geminiKey) {
      if (hasGoogleCse) {
        try {
          const items = await fetchGoogleCseItems(safeQ, apiKey, cx);
          return NextResponse.json({
            provider: "google",
            items,
            fallback: { used: true, reason: "gemini_key_missing" },
            note: "Using Web Search fallback (Gemini Key Issue).",
            disclaimer:
              "Third-party snippets only—not medical advice. Always confirm with a licensed veterinarian.",
          });
        } catch {
          try {
            const fallback = await fetchOpenWebFallbackItems(request, safeQ);
            return NextResponse.json({
              provider: fallback.provider,
              items: fallback.items,
              fallback: { used: true, reason: "gemini_key_missing" },
              note: "Using Web Search fallback (Gemini Key Issue).",
              disclaimer:
                "Third-party snippets only—not medical advice. Always confirm with a licensed veterinarian.",
            });
          } catch {
            /* continue to original not configured response */
          }
        }
      }
      return NextResponse.json(
        {
          error: "not_configured",
          message:
            "Add GEMINI_API_KEY (server-only) to .env.local to use Gemini research mode. Use only official Google AI Studio key.",
        },
        { status: 503 }
      );
    }

    const modelId = (process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL;
    const fallbackModels = (process.env.GEMINI_FALLBACK_MODELS ?? "gemini-2.5-flash-lite")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);
    const modelsToTry = Array.from(new Set([modelId, ...fallbackModels]));
    const prompt =
      intent === "pet"
        ? `Give concise pet-safety guidance for: "${safeQ}". Use short bullet points. Avoid diagnosis and unsafe instructions.`
        : `Give 5 concise, factual bullet points about: "${safeQ}". Keep it pet-safety focused. Avoid diagnosis and include only practical guidance.`;

    const genAI = new GoogleGenerativeAI(geminiKey);
    let lastMessage = "Gemini generation failed.";
    let hadQuotaError = false;
    let hadAuthError = false;
    let retryAfterSeconds = 30;

    for (const modelName of modelsToTry) {
      try {
        // Official SDK flow (stable configuration): get model -> generateContent.
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const answerText = cleanText(result.response.text(), 6000);
        const items = toGeminiItems(answerText, safeQ);

        return NextResponse.json({
          provider: "gemini",
          model: modelName,
          items,
          disclaimer:
            "Gemini-generated summary, informational only—not medical advice. Always confirm with a licensed veterinarian.",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Gemini generation failed.";
        lastMessage = message;
        if (isGeminiAuthError(message)) {
          hadAuthError = true;
          break;
        }
        if (message.includes("429") || message.toLowerCase().includes("quota")) {
          hadQuotaError = true;
          retryAfterSeconds = parseRetrySeconds(message);
          continue;
        }
      }
    }

    if (hadAuthError) {
      if (hasGoogleCse) {
        try {
          const items = await fetchGoogleCseItems(safeQ, apiKey, cx);
          return NextResponse.json({
            provider: "google",
            items,
            fallback: { used: true, reason: "gemini_key_issue" },
            note: "Using Web Search fallback (Gemini Key Issue).",
            disclaimer:
              "Third-party snippets only—not medical advice. Always confirm with a licensed veterinarian.",
          });
        } catch {
          /* continue to open-web fallback below */
        }
      }
      try {
        const fallback = await fetchOpenWebFallbackItems(request, safeQ);
        return NextResponse.json({
          provider: fallback.provider,
          items: fallback.items,
          fallback: { used: true, reason: "gemini_key_issue" },
          note: "Using Web Search fallback (Gemini Key Issue).",
          disclaimer:
            "Third-party snippets only—not medical advice. Always confirm with a licensed veterinarian.",
        });
      } catch {
        return NextResponse.json(
          { error: "gemini_api_error", message: `${lastMessage} | Web fallback failed.` },
          { status: 502 }
        );
      }
    }

    if (hadQuotaError) {
      return NextResponse.json(
        {
          error: "gemini_quota_exceeded",
          message: `Gemini free-tier quota hit. Retry after ${retryAfterSeconds}s or use fallback cached response.`,
          retryAfterSeconds,
          attemptedModels: modelsToTry,
        },
        { status: 429 }
      );
    }
    return NextResponse.json({ error: "gemini_api_error", message: lastMessage }, { status: 502 });
  }

  if (!apiKey || !cx) {
    return NextResponse.json(
      {
        error: "not_configured",
        message:
          "Add GOOGLE_CSE_ID (Programmable Search Engine cx) and GOOGLE_CSE_API_KEY or GEMINI_API_KEY to .env.local. Enable Custom Search API on that Google Cloud key.",
      },
      { status: 503 }
    );
  }

  try {
    const items = await fetchGoogleCseItems(safeQ, apiKey, cx);

    return NextResponse.json({
      provider: "google",
      items,
      disclaimer:
        "Third-party snippets only—not medical advice. Always confirm with a licensed veterinarian.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google search request failed.";
    return NextResponse.json({ error: "network_error", message }, { status: 502 });
  }
}
