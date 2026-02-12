import en from '../text/en.json';

type Params = Record<string, string | number>;

function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function formatTemplate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = params[key];
    return value === undefined ? '' : String(value);
  });
}

function resolvePluralKey(key: string, params?: Params): string {
  const count = params?.count;
  if (typeof count !== 'number') return key;

  const oneKey = `${key}_one`;
  const otherKey = `${key}_other`;
  if (getByPath(en, oneKey) !== undefined || getByPath(en, otherKey) !== undefined) {
    return count === 1 ? oneKey : otherKey;
  }

  const legacyPluralKey = `${key}_plural`;
  if (getByPath(en, legacyPluralKey) !== undefined) {
    return count === 1 ? key : legacyPluralKey;
  }

  return key;
}

function t(key: string, params?: Params): string {
  const effectiveKey = resolvePluralKey(key, params);
  const value = getByPath(en, effectiveKey);
  if (typeof value !== 'string') return key;
  return formatTemplate(value, params);
}

export function useTranslation() {
  return {
    t,
    i18n: {
      language: 'en',
      changeLanguage: async (_lang: string) => 'en',
    },
  };
}

