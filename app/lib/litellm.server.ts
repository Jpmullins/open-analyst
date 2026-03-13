import { env } from "~/lib/env.server";
import { supportsToolCalling } from "~/lib/model-capabilities";

export interface LitellmModel {
  id: string;
  name: string;
  supportsTools: boolean;
}

// Simple in-memory cache so we don't hit LiteLLM on every request
let cachedModels: LitellmModel[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch available models from the LiteLLM gateway.
 * Results are cached for 5 minutes. On gateway failure, returns stale cache
 * if available rather than throwing.
 */
export async function fetchModels(): Promise<LitellmModel[]> {
  if (cachedModels && Date.now() - cacheTime < CACHE_TTL) {
    return cachedModels;
  }

  const res = await fetch(`${env.LITELLM_BASE_URL}/v1/models`, {
    headers: { Authorization: `Bearer ${env.LITELLM_API_KEY}` },
  });

  if (!res.ok) {
    // Return stale cache rather than failing hard
    if (cachedModels) return cachedModels;
    const body = await res.text().catch(() => "");
    throw new Error(`LiteLLM gateway error: ${res.status} ${body}`);
  }

  const data = (await res.json()) as { data?: Array<{ id: string }> };
  cachedModels = (data.data || []).map((m) => ({
    id: m.id,
    name: m.id,
    supportsTools: supportsToolCalling(m.id),
  }));
  cacheTime = Date.now();
  return cachedModels;
}

/**
 * Validate `currentModel` against LiteLLM's available models.
 * Returns the model ID to use — either the current one (if still valid)
 * or the first available model from LiteLLM.
 *
 * If LiteLLM is unreachable and there's no cache, returns `currentModel`
 * unchanged so we don't block the user.
 */
export async function resolveModel(
  currentModel: string,
  options?: { requireToolSupport?: boolean }
): Promise<string> {
  const requireToolSupport = options?.requireToolSupport === true;
  let models: LitellmModel[];
  try {
    models = await fetchModels();
  } catch {
    // Gateway down, no cache — keep whatever the user had
    return currentModel;
  }

  if (models.length === 0) return currentModel;

  const current = currentModel ? models.find((m) => m.id === currentModel) : undefined;
  if (current && (!requireToolSupport || current.supportsTools)) {
    return current.id;
  }

  const supported = models.find((model) => model.supportsTools);
  if (requireToolSupport && supported) {
    return supported.id;
  }

  if (current) {
    return current.id;
  }

  return models[0].id;
}
