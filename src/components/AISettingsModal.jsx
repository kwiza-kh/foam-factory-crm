import { useState } from 'react';
import { X, Bot } from 'lucide-react';
import { saveAISettings, PROVIDER_DEFAULTS } from '../lib/aiSettings.js';

const PROVIDER_LABELS = {
  anthropic:          'Claude (Anthropic)',
  openai:             'OpenAI',
  'custom-openai':    '自定义 OpenAI-compatible',
  'custom-anthropic': '自定义 Anthropic-compatible',
};

const MODEL_PRESETS = {
  anthropic: ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-haiku-4-5-20251001'],
  openai:    ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
};

function Field({ label, required = false, children }) {
  return (
    <label className="field">
      <span>{label}{required ? <b>*</b> : null}</span>
      {children}
    </label>
  );
}

export function AISettingsModal({ settings, onClose, onSave }) {
  const [form, setForm] = useState({ ...settings });

  const handleProviderChange = (provider) => {
    const defaults = PROVIDER_DEFAULTS[provider];
    setForm(prev => ({ ...prev, provider, baseUrl: defaults.baseUrl, model: defaults.model }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    saveAISettings(form);
    onSave(form);
    onClose();
  };

  const isAnthropic = form.provider === 'anthropic' || form.provider === 'custom-anthropic';
  const presets = isAnthropic ? MODEL_PRESETS.anthropic : MODEL_PRESETS.openai;

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal-card small" onSubmit={handleSubmit}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">AI SETTINGS</p>
            <h3>配置 AI 大模型</h3>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Field label="服务商">
            <select value={form.provider} onChange={e => handleProviderChange(e.target.value)}>
              {Object.entries(PROVIDER_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </Field>

          <Field label="Base URL">
            <input
              value={form.baseUrl}
              onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))}
              placeholder="https://api.anthropic.com"
            />
          </Field>

          <Field label="API Key" required>
            <input
              type="password"
              value={form.apiKey}
              onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
              placeholder="sk-ant-..."
            />
          </Field>

          <Field label="模型">
            <input
              list="ai-model-list"
              value={form.model}
              onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
              placeholder="claude-sonnet-4-6"
            />
            <datalist id="ai-model-list">
              {presets.map(m => <option key={m} value={m} />)}
            </datalist>
          </Field>
        </div>

        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={onClose}>取消</button>
          <button className="primary-action compact" type="submit">
            <Bot size={15} />
            保存
          </button>
        </div>
      </form>
    </div>
  );
}
