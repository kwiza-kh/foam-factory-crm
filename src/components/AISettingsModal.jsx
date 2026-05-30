import { useState } from 'react';
import { X, Bot, Loader2, RefreshCw } from 'lucide-react';
import { saveAISettings, PROVIDER_DEFAULTS } from '../lib/aiSettings.js';
import { fetchModels, testConnection } from '../lib/ai-import/aiClient.js';

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
  const [fetchedModels, setFetchedModels] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [testStatus, setTestStatus] = useState(null); // null | 'testing' | 'ok' | 'error'
  const [testError, setTestError] = useState(null);

  const handleProviderChange = (provider) => {
    const defaults = PROVIDER_DEFAULTS[provider];
    setForm(prev => ({ ...prev, provider, baseUrl: defaults.baseUrl, model: defaults.model }));
    setFetchedModels(null);
    setFetchError(null);
  };

  const handleFetchModels = async () => {
    setFetching(true);
    setFetchError(null);
    try {
      const models = await fetchModels(form);
      setFetchedModels(models);
      if (!form.model || !models.includes(form.model)) {
        setForm(f => ({ ...f, model: models[0] }));
      }
    } catch (err) {
      setFetchError(err.message);
    } finally {
      setFetching(false);
    }
  };

  const handleTestConnection = async () => {
    setTestStatus('testing');
    setTestError(null);
    try {
      await testConnection(form);
      setTestStatus('ok');
    } catch (err) {
      setTestStatus('error');
      setTestError(err.message);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    saveAISettings(form);
    onSave(form);
    onClose();
  };

  const isAnthropic = form.provider === 'anthropic' || form.provider === 'custom-anthropic';
  const fallbackPresets = isAnthropic ? MODEL_PRESETS.anthropic : MODEL_PRESETS.openai;
  const canFetch = Boolean(form.baseUrl && form.apiKey);

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

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>模型</span>
              <button
                type="button"
                className="ghost-button compact"
                style={{ fontSize: 12, padding: '3px 8px' }}
                disabled={!canFetch || fetching}
                onClick={handleFetchModels}
                title={canFetch ? '从 Base URL 获取模型列表' : '请先填写 Base URL 和 API Key'}
              >
                {fetching
                  ? <Loader2 size={12} style={{ animation: 'spin 0.9s linear infinite' }} />
                  : <RefreshCw size={12} />
                }
                {fetching ? '获取中…' : '获取模型列表'}
              </button>
              {fetchError && (
                <span style={{ fontSize: 12, color: 'var(--red)' }} title={fetchError}>获取失败</span>
              )}
            </div>

            {fetchedModels ? (
              <select
                value={form.model}
                onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                style={{ width: '100%' }}
              >
                {fetchedModels.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            ) : (
              <>
                <input
                  list="ai-model-list"
                  value={form.model}
                  onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                  placeholder="claude-sonnet-4-6"
                  style={{ width: '100%' }}
                />
                <datalist id="ai-model-list">
                  {fallbackPresets.map(m => <option key={m} value={m} />)}
                </datalist>
              </>
            )}
          </div>
        </div>

        <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="ghost-button compact"
              disabled={!canFetch || testStatus === 'testing'}
              onClick={handleTestConnection}
            >
              {testStatus === 'testing'
                ? <Loader2 size={13} style={{ animation: 'spin 0.9s linear infinite' }} />
                : null}
              {testStatus === 'testing' ? '测试中…' : '测试连接'}
            </button>
            {testStatus === 'ok' && (
              <span style={{ fontSize: 12, color: 'var(--green)' }}>✓ 连接正常</span>
            )}
            {testStatus === 'error' && (
              <span style={{ fontSize: 12, color: 'var(--red)' }} title={testError}>✗ 连接失败</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ghost-button" type="button" onClick={onClose}>取消</button>
            <button className="primary-action compact" type="submit">
              <Bot size={15} />
              保存
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
