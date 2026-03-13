import type {
  AppConfig,
} from '~/lib/types';

export type BrowserChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

const STORAGE_KEY = 'open-analyst.browser.config.v1';

const defaultBrowserConfig: AppConfig = {
  provider: 'openrouter',
  apiKey: '',
  baseUrl: '',
  model: '',
  isConfigured: false,
};

export function getBrowserConfig(): AppConfig {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultBrowserConfig;
    }
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    return {
      ...defaultBrowserConfig,
      ...parsed,
      model: parsed.model || defaultBrowserConfig.model,
      isConfigured: Boolean(parsed.isConfigured),
    };
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
    isConfigured: updates.isConfigured ?? current.isConfigured,
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  return merged;
}
