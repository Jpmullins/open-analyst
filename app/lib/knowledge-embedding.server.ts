import { env } from "~/lib/env.server";

const MAX_EMBEDDING_INPUT_CHARS = 12000;

function cleanText(value: string): string {
  return String(value || "")
    .replace(/\0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isPlaceholderContent(value: string): boolean {
  return /^\[(?:Binary file|Generated artifact) stored at .+\]$/.test(value);
}

export function isKnowledgeEmbeddingConfigured(): boolean {
  return Boolean(env.LITELLM_BASE_URL && env.LITELLM_EMBEDDING_MODEL);
}

export function buildKnowledgeEmbeddingText(input: {
  title?: string | null;
  content?: string | null;
}): string {
  const title = cleanText(input.title || "");
  const content = cleanText(input.content || "");
  const usefulContent = isPlaceholderContent(content) ? "" : content;
  return [title, usefulContent]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, MAX_EMBEDDING_INPUT_CHARS);
}

export async function embedKnowledgeTexts(
  texts: string[]
): Promise<number[][]> {
  const prepared = texts
    .map((text) => cleanText(text).slice(0, MAX_EMBEDDING_INPUT_CHARS))
    .filter(Boolean);

  if (!prepared.length) {
    return [];
  }
  if (!isKnowledgeEmbeddingConfigured()) {
    throw new Error(
      "Open Analyst knowledge embeddings require LITELLM_BASE_URL and LITELLM_EMBEDDING_MODEL."
    );
  }

  const res = await fetch(`${env.LITELLM_BASE_URL}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.LITELLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.LITELLM_EMBEDDING_MODEL,
      input: prepared,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Knowledge embedding request failed: ${res.status} ${body}`);
  }

  const payload = (await res.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };
  const embeddings = (payload.data || [])
    .map((item) => (Array.isArray(item?.embedding) ? item.embedding : null))
    .filter((item): item is number[] => Array.isArray(item));

  if (embeddings.length !== prepared.length) {
    throw new Error("Knowledge embedding response size mismatch.");
  }

  return embeddings;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (!length) return 0;

  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (let i = 0; i < length; i += 1) {
    const av = Number(a[i] || 0);
    const bv = Number(b[i] || 0);
    dot += av * bv;
    aNorm += av * av;
    bNorm += bv * bv;
  }
  if (!aNorm || !bNorm) return 0;
  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}
