const KEY = 'foam-factory-crm:ai-settings';

export const PROVIDER_DEFAULTS = {
  anthropic:          { baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-6' },
  openai:             { baseUrl: 'https://api.openai.com',    model: 'gpt-4o' },
  'custom-openai':    { baseUrl: '',                          model: '' },
  'custom-anthropic': { baseUrl: '',                          model: '' },
};

export const DEFAULT_SETTINGS = {
  provider: 'anthropic',
  baseUrl:  'https://api.anthropic.com',
  apiKey:   '',
  model:    'claude-sonnet-4-6',
};

export function loadAISettings() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveAISettings(settings) {
  localStorage.setItem(KEY, JSON.stringify(settings));
}
