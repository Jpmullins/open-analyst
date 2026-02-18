import type {
  ApiTestInput,
  ApiTestResult,
  AppConfig,
  ProviderPresets,
} from '../types';

export const FALLBACK_PRESETS: ProviderPresets = {
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api',
    models: [
      { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5' },
      { id: 'anthropic/claude-opus-4.5', name: 'Claude Opus 4.5' },
      { id: 'openai/gpt-4o', name: 'GPT-4o' },
    ],
    keyPlaceholder: 'sk-or-v1-...',
    keyHint: 'Get key from openrouter.ai/keys',
  },
  anthropic: {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    models: [
      { id: 'claude-sonnet-4-5', name: 'claude-sonnet-4-5' },
      { id: 'claude-opus-4-5', name: 'claude-opus-4-5' },
      { id: 'claude-haiku-4-5', name: 'claude-haiku-4-5' },
    ],
    keyPlaceholder: 'sk-ant-...',
    keyHint: 'Get key from console.anthropic.com',
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-5.2', name: 'gpt-5.2' },
      { id: 'gpt-5.2-codex', name: 'gpt-5.2-codex' },
      { id: 'gpt-5.2-mini', name: 'gpt-5.2-mini' },
    ],
    keyPlaceholder: 'sk-...',
    keyHint: 'Get key from platform.openai.com',
  },
  bedrock: {
    name: 'Amazon Bedrock',
    baseUrl: 'https://bedrock-mantle.us-east-1.api.aws/v1',
    models: [
      { id: 'openai.gpt-oss-120b-1:0', name: 'openai.gpt-oss-120b-1:0' },
      { id: 'openai.gpt-oss-20b-1:0', name: 'openai.gpt-oss-20b-1:0' },
      { id: 'anthropic.claude-3-5-sonnet-20241022-v2:0', name: 'anthropic.claude-3-5-sonnet-20241022-v2:0' },
    ],
    keyPlaceholder: 'bedrock_api_key',
    keyHint: 'Create API key in Bedrock console and set your AWS region endpoint',
  },
  custom: {
    name: 'Custom Endpoint',
    baseUrl: 'https://api.anthropic.com',
    models: [
      { id: 'claude-sonnet-4-5', name: 'claude-sonnet-4-5' },
      { id: 'gpt-4o', name: 'gpt-4o' },
      { id: 'gpt-4o-mini', name: 'gpt-4o-mini' },
    ],
    keyPlaceholder: 'sk-xxx',
    keyHint: 'Enter your API key',
  },
};

const STORAGE_KEY = 'open-analyst.browser.config.v1';

const defaultBrowserConfig: AppConfig = {
  provider: 'openrouter',
  apiKey: '',
  baseUrl: FALLBACK_PRESETS.openrouter.baseUrl,
  customProtocol: 'anthropic',
  bedrockRegion: 'us-east-1',
  model: FALLBACK_PRESETS.openrouter.models[0].id,
  openaiMode: 'responses',
  enableThinking: false,
  sandboxEnabled: false,
  isConfigured: false,
};

function normalizeConfig(config: AppConfig): AppConfig {
  const provider = config.provider || defaultBrowserConfig.provider;
  const inferredRegion = extractBedrockRegionFromUrl(config.baseUrl || '');
  const region =
    (config.bedrockRegion || '')
      .trim()
      .toLowerCase() ||
    inferredRegion ||
    (provider === 'bedrock' ? 'us-east-1' : (defaultBrowserConfig.bedrockRegion || 'us-east-1'));
  const providerBaseUrl = FALLBACK_PRESETS[provider]?.baseUrl || '';
  const bedrockBaseUrl = `https://bedrock-mantle.${region}.api.aws/v1`;
  const baseUrl =
    provider === 'custom'
      ? (config.baseUrl || '')
      : (provider === 'bedrock'
        ? normalizeBedrockBaseUrl(config.baseUrl || bedrockBaseUrl, region)
        : providerBaseUrl);
  return {
    ...config,
    baseUrl,
    bedrockRegion: region,
    openaiMode: 'responses',
    isConfigured: Boolean(config.apiKey?.trim()) && Boolean(config.isConfigured),
  };
}

export function getBrowserConfig(): AppConfig {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultBrowserConfig;
    }
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    const merged: AppConfig = {
      ...defaultBrowserConfig,
      ...parsed,
      apiKey: parsed.apiKey || '',
      model: parsed.model || defaultBrowserConfig.model,
      provider: parsed.provider || defaultBrowserConfig.provider,
    };
    if (merged.provider !== 'custom' && merged.provider !== 'bedrock') {
      merged.baseUrl = FALLBACK_PRESETS[merged.provider].baseUrl;
    }
    if (!merged.apiKey) {
      merged.isConfigured = false;
    }
    return normalizeConfig(merged);
  } catch {
    return defaultBrowserConfig;
  }
}

export function saveBrowserConfig(
  updates: Partial<AppConfig>,
): AppConfig {
  const current = getBrowserConfig();
  const merged: AppConfig = {
    ...current,
    ...updates,
    apiKey: updates.apiKey ?? current.apiKey,
    isConfigured:
      updates.isConfigured ??
      Boolean((updates.apiKey ?? current.apiKey)?.trim()),
  };
  const normalized = normalizeConfig(merged);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export type BrowserChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function normalizeBedrockBaseUrl(url: string, region: string): string {
  const fallback = `https://bedrock-mantle.${region}.api.aws/v1`;
  const raw = String(url || '').trim();
  if (!raw) return fallback;
  const trimmed = trimTrailingSlash(raw);
  if (trimmed.endsWith('/v1')) return trimmed;
  return `${trimmed}/v1`;
}

function extractBedrockRegionFromUrl(url: string): string | null {
  const value = String(url || '').trim().toLowerCase();
  const runtimeMatch = value.match(/bedrock-runtime\.([a-z0-9-]+)\.amazonaws\.com/);
  if (runtimeMatch?.[1]) return runtimeMatch[1];
  const mantleMatch = value.match(/bedrock-mantle\.([a-z0-9-]+)\.api\.aws/);
  return mantleMatch?.[1] || null;
}

function classifyStatus(status: number): ApiTestResult['errorType'] {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server_error';
  return 'unknown';
}

export async function testApiConnectionBrowser(
  input: ApiTestInput,
): Promise<ApiTestResult> {
  const apiKey = input.apiKey?.trim();
  if (!apiKey) {
    return { ok: false, errorType: 'missing_key', details: 'API key is required' };
  }

  const openAiProtocol =
    input.provider === 'openai' ||
    input.provider === 'bedrock' ||
    (input.provider === 'custom' && input.customProtocol === 'openai');

  let baseUrl =
    input.baseUrl?.trim() ||
    FALLBACK_PRESETS[input.provider].baseUrl;

  if (!baseUrl) {
    return {
      ok: false,
      errorType: 'missing_base_url',
      details: 'Base URL is required',
    };
  }

  baseUrl = input.provider === 'bedrock'
    ? normalizeBedrockBaseUrl(baseUrl, extractBedrockRegionFromUrl(baseUrl) || 'us-east-1')
    : trimTrailingSlash(baseUrl);

  let url: string;
  let headers: Record<string, string>;

  if (openAiProtocol) {
    url = `${baseUrl}/models`;
    headers = {
      Authorization: `Bearer ${apiKey}`,
    };
  } else if (input.provider === 'openrouter') {
    url = `${baseUrl}/v1/models`;
    headers = {
      Authorization: `Bearer ${apiKey}`,
    };
  } else {
    url = `${baseUrl}/v1/models`;
    headers = {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    };
  }

  const start = Date.now();

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
    });
    const latencyMs = Date.now() - start;

    if (response.ok) {
      return { ok: true, status: response.status, latencyMs };
    }

    let details = response.statusText || `HTTP ${response.status}`;
    try {
      const json = (await response.json()) as {
        error?: { message?: string };
        message?: string;
      };
      details = json.error?.message || json.message || details;
    } catch {
      // Ignore body parsing error and keep status text.
    }

    return {
      ok: false,
      status: response.status,
      latencyMs,
      errorType: classifyStatus(response.status),
      details,
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      errorType: 'network_error',
      details: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function createBrowserChatCompletion(
  config: AppConfig,
  messages: BrowserChatMessage[],
): Promise<string> {
  const apiKey = config.apiKey?.trim();
  if (!apiKey) {
    throw new Error('API key is missing');
  }

  const openAiCompatible =
    config.provider === 'openai' ||
    config.provider === 'bedrock' ||
    config.provider === 'openrouter' ||
    (config.provider === 'custom' && config.customProtocol === 'openai');

  if (!openAiCompatible) {
    throw new Error(
      'Browser mode currently supports OpenAI-compatible providers only.',
    );
  }

  const baseUrl = trimTrailingSlash(
    (config.provider === 'custom' || config.provider === 'bedrock'
      ? config.baseUrl
      : FALLBACK_PRESETS[config.provider].baseUrl) || '',
  );

  if (!baseUrl) {
    throw new Error('Base URL is required');
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages,
    }),
  });

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const details =
      payload?.error?.message ||
      payload?.message ||
      `HTTP ${response.status}`;
    throw new Error(details);
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string' && content.trim()) {
    return content;
  }
  if (Array.isArray(content)) {
    const text = content
      .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
      .join('');
    if (text.trim()) return text;
  }

  return 'No content returned by model.';
}
