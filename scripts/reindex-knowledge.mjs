import "dotenv/config";

import process from "node:process";

import pg from "pg";

const MAX_EMBEDDING_INPUT_CHARS = 12000;

function cleanText(value) {
  return String(value || "")
    .replace(/\0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isPlaceholderContent(value) {
  return /^\[(?:Binary file|Generated artifact) stored at .+\]$/.test(value);
}

function buildKnowledgeEmbeddingText({ title, content }) {
  const cleanTitle = cleanText(title);
  const cleanContent = cleanText(content);
  const usefulContent = isPlaceholderContent(cleanContent) ? "" : cleanContent;
  return [cleanTitle, usefulContent]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, MAX_EMBEDDING_INPUT_CHARS);
}

async function embedKnowledgeTexts(baseUrl, apiKey, model, texts) {
  const prepared = texts
    .map((text) => cleanText(text).slice(0, MAX_EMBEDDING_INPUT_CHARS))
    .filter(Boolean);

  if (!prepared.length) {
    return [];
  }

  const res = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: prepared,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Knowledge embedding request failed: ${res.status} ${body}`);
  }

  const payload = await res.json();
  const embeddings = (payload.data || [])
    .map((item) => (Array.isArray(item?.embedding) ? item.embedding : null))
    .filter((item) => Array.isArray(item));

  if (embeddings.length !== prepared.length) {
    throw new Error("Knowledge embedding response size mismatch.");
  }

  return embeddings;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const baseUrl = process.env.LITELLM_BASE_URL;
  const apiKey = process.env.LITELLM_API_KEY || "";
  const model = process.env.LITELLM_EMBEDDING_MODEL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }
  if (!baseUrl || !model) {
    throw new Error("LITELLM_BASE_URL and LITELLM_EMBEDDING_MODEL are required.");
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  const result = await client.query(`
    SELECT id, project_id, title, content, metadata
    FROM documents
    ORDER BY updated_at DESC
  `);

  let indexed = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of result.rows) {
    const metadata =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? { ...row.metadata }
        : {};
    const input = buildKnowledgeEmbeddingText({
      title: row.title,
      content: row.content,
    });

    if (!input) {
      await client.query(
        `
          UPDATE documents
          SET embedding = NULL,
              metadata = $2::jsonb,
              updated_at = NOW()
          WHERE id = $1
        `,
        [
          row.id,
          JSON.stringify({
            ...metadata,
            knowledgeIndexStatus: "skipped",
            knowledgeIndexError: "No indexable text was available for this document.",
          }),
        ],
      );
      skipped += 1;
      continue;
    }

    try {
      const [embedding] = await embedKnowledgeTexts(baseUrl, apiKey, model, [input]);
      await client.query(
        `
          UPDATE documents
          SET embedding = $2::jsonb,
              metadata = $3::jsonb,
              updated_at = NOW()
          WHERE id = $1
        `,
        [
          row.id,
          JSON.stringify(embedding || null),
          JSON.stringify({
            ...metadata,
            knowledgeIndexStatus: "indexed",
            knowledgeIndexError: null,
            knowledgeIndexedAt: new Date().toISOString(),
          }),
        ],
      );
      indexed += 1;
    } catch (error) {
      await client.query(
        `
          UPDATE documents
          SET embedding = NULL,
              metadata = $2::jsonb,
              updated_at = NOW()
          WHERE id = $1
        `,
        [
          row.id,
          JSON.stringify({
            ...metadata,
            knowledgeIndexStatus: "error",
            knowledgeIndexError: error instanceof Error ? error.message : String(error),
          }),
        ],
      );
      failed += 1;
    }
  }

  await client.end();
  console.log(JSON.stringify({ indexed, skipped, failed, total: result.rows.length }));
}

await main();
