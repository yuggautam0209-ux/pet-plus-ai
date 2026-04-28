import { NextResponse } from "next/server";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import * as cheerio from "cheerio";
import { getClientIp, isRateLimited } from "@/lib/security/rateLimit";
import { hasSensitiveData } from "@/lib/security/privacy";

const DUCKDUCKGO_TIMEOUT_MS = 12_000;

type SearchItem = {
  title: string;
  link: string;
  displayLink: string;
  snippet: string;
};

function sanitizeQuery(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 180) return "";
  return trimmed
    .replace(/[^a-zA-Z0-9\u0900-\u097F\s.,?\-()]/g, "")
    .slice(0, 160);
}

function simplifyQuery(raw: string) {
  const lowered = raw.toLowerCase();
  const compact = lowered.replace(/[^a-z0-9\u0900-\u097F\s]/g, " ");
  const stopwords = new Set([
    "give",
    "latest",
    "fresh",
    "return",
    "short",
    "lines",
    "line",
    "only",
    "avoid",
    "with",
    "for",
    "and",
    "the",
    "a",
    "an",
    "of",
    "to",
    "in",
    "on",
    "unknown",
    "kg",
    "pet",
  ]);
  const keywords = compact
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => token.length > 2 && !stopwords.has(token))
    .slice(0, 8);
  return keywords.join(" ").trim();
}

function cleanText(value: string, maxLen: number) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, maxLen);
}

function toDisplayHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "duckduckgo.com";
  }
}

function unwrapDuckDuckGoLink(rawUrl: string) {
  const href = rawUrl.startsWith("//") ? `https:${rawUrl}` : rawUrl;
  try {
    const parsed = new URL(href);
    if (parsed.hostname.includes("duckduckgo.com") && parsed.pathname.startsWith("/l/")) {
      const uddg = parsed.searchParams.get("uddg");
      if (uddg) return decodeURIComponent(uddg);
    }
    return href;
  } catch {
    return href;
  }
}

async function fetchDuckDuckGoHtml(q: string): Promise<SearchItem[]> {
  try {
    let upstream: Response;
    try {
      upstream = await fetchWithTimeout(
        `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
        {
          headers: {
            "user-agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
            accept: "text/html,application/xhtml+xml",
          },
          cache: "no-store",
        },
        DUCKDUCKGO_TIMEOUT_MS
      );
    } catch {
      return [];
    }
    if (!upstream.ok) return [];

    const html = await upstream.text();
    const $ = cheerio.load(html);
    const items: SearchItem[] = [];

    $(".result__a").each((_, el) => {
      if (items.length >= 15) return false;
      const titleNode = $(el);
      const hrefRaw = titleNode.attr("href") ?? "";
      const title = cleanText(titleNode.text(), 180);
      const container = titleNode.closest(".result").length ? titleNode.closest(".result") : titleNode.parent().parent();
      const snippet = cleanText(container.find(".result__snippet").first().text(), 320);
      if (!hrefRaw || !title) return;
      const href = unwrapDuckDuckGoLink(hrefRaw);
      if (href.includes("duckduckgo.com/y.js?ad_domain=")) return;
      if (items.some((row) => row.link === href)) return;
      items.push({
        title,
        link: href,
        displayLink: toDisplayHost(href),
        snippet: snippet || "Open result to read more.",
      });
    });

    return items;
  } catch {
    return [];
  }
}

async function fetchDuckDuckGoInstant(q: string): Promise<SearchItem[]> {
  try {
    const upstream = await fetchWithTimeout(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_redirect=1&no_html=1`,
      { cache: "no-store" },
      8000
    );
    if (!upstream.ok) return [];
    const data = (await upstream.json()) as {
      AbstractText?: string;
      AbstractURL?: string;
      Heading?: string;
      RelatedTopics?: Array<
        | { Text?: string; FirstURL?: string }
        | { Name?: string; Topics?: Array<{ Text?: string; FirstURL?: string }> }
      >;
    };

    const out: SearchItem[] = [];
    if (data.AbstractText && data.AbstractURL) {
      out.push({
        title: cleanText(data.Heading || "DuckDuckGo instant result", 180),
        link: cleanText(data.AbstractURL, 500),
        displayLink: toDisplayHost(data.AbstractURL),
        snippet: cleanText(data.AbstractText, 320),
      });
    }
    const topics = data.RelatedTopics ?? [];
    for (const topic of topics) {
      const rows = "Topics" in topic && Array.isArray(topic.Topics) ? topic.Topics : [topic];
      for (const row of rows) {
        if (out.length >= 12) break;
        const link = "FirstURL" in row && row.FirstURL ? cleanText(row.FirstURL, 500) : "";
        const text = "Text" in row && row.Text ? cleanText(row.Text, 320) : "";
        if (!link || !text) continue;
        out.push({
          title: text.split(" - ")[0].slice(0, 180) || "DuckDuckGo topic",
          link,
          displayLink: toDisplayHost(link),
          snippet: text,
        });
      }
      if (out.length >= 12) break;
    }
    return out;
  } catch {
    return [];
  }
}

function buildFallbackItems(q: string): SearchItem[] {
  const query = encodeURIComponent(q);
  return [
    {
      title: "ASPCA Pet Care",
      link: `https://www.aspca.org/pet-care`,
      displayLink: "aspca.org",
      snippet: "Trusted pet care guidance. Search this source for practical safety and nutrition references.",
    },
    {
      title: "AVMA Pet Owners",
      link: "https://www.avma.org/resources-tools/pet-owners",
      displayLink: "avma.org",
      snippet: "Veterinary-reviewed owner resources for day-to-day pet health and preventive care.",
    },
    {
      title: "Merck Veterinary Manual",
      link: "https://www.merckvetmanual.com/",
      displayLink: "merckvetmanual.com",
      snippet: "Clinical veterinary reference. Use for condition understanding, then verify with a licensed vet.",
    },
    {
      title: `DuckDuckGo query: ${q}`,
      link: `https://duckduckgo.com/?q=${query}`,
      displayLink: "duckduckgo.com",
      snippet: "Open this query directly for additional results when snippet extraction is limited.",
    },
  ];
}

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const limit = isRateLimited(`search:${ip}`, 45, 60_000);
  if (limit.limited) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many requests. Please retry shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }
  const { searchParams } = new URL(request.url);
  const q = sanitizeQuery(searchParams.get("q") ?? "");
  if (!q) {
    return NextResponse.json({ error: "invalid_query", message: "Query is empty or invalid." }, { status: 400 });
  }
  if (hasSensitiveData(q)) {
    return NextResponse.json(
      { error: "blocked_sensitive_query", message: "Remove personal info (email/phone/payment ids) before searching." },
      { status: 400 }
    );
  }

  try {
    const attempts = [simplifyQuery(q), q, `${q} pet care`].filter(Boolean);
    let items: SearchItem[] = [];
    for (const candidate of attempts) {
      items = await fetchDuckDuckGoHtml(candidate);
      if (items.length > 0) break;
    }

    if (items.length === 0) items = await fetchDuckDuckGoInstant(q);
    if (items.length === 0) items = buildFallbackItems(q);

    return NextResponse.json({
      provider: "open-web",
      items,
      note: items.length
        ? "Results from open web search snippets. Informational only, not medical advice."
        : "No open web results found. Try broader keywords.",
    });
  } catch {
    return NextResponse.json(
      {
        error: "network_error",
        message: "Open web search failed. Please retry.",
      },
      { status: 502 }
    );
  }
}
