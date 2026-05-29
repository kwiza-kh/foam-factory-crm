/**
 * messages 格式使用 Anthropic 规范：
 * [{ role: 'user', content: string | Array<{type:'text',text:string}|{type:'image',source:{type:'base64',media_type:string,data:string}}> }]
 * OpenAI-compatible 调用时自动转换。
 */

const ANTHROPIC_PROVIDERS = new Set(['anthropic', 'custom-anthropic']);

/**
 * Fetch available models from the provider's /v1/models endpoint.
 * Returns an array of model ID strings, sorted alphabetically.
 */
export async function fetchModels(settings) {
  const { provider, apiKey, baseUrl } = settings;
  if (!apiKey)  throw new Error('请先填写 API Key');
  if (!baseUrl) throw new Error('请先填写 Base URL');

  const isAnthropic = ANTHROPIC_PROVIDERS.has(provider);
  const url = `${baseUrl}/v1/models`;

  const headers = isAnthropic
    ? {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      }
    : { 'Authorization': `Bearer ${apiKey}` };

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`获取模型列表失败 ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const models = (data.data || []).map(m => m.id).filter(Boolean);
  if (models.length === 0) throw new Error('未返回任何模型，请检查 Base URL 和 API Key');
  return models.sort();
}

/**
 * Send a minimal message to verify the API key and endpoint are working.
 * Returns the model's brief reply string on success, throws on failure.
 */
export async function testConnection(settings) {
  const reply = await callAI(settings, [
    { role: 'user', content: '请回复"连接正常"四个字，不要其他内容。' },
  ]);
  return reply;
}

export async function callAI(settings, messages) {
  const { provider, apiKey, baseUrl, model } = settings;
  if (!apiKey) throw new Error('请先在 AI 设置中填写 API Key');
  if (!model)  throw new Error('请先在 AI 设置中填写模型名称');

  if (ANTHROPIC_PROVIDERS.has(provider)) {
    return callAnthropic(baseUrl || 'https://api.anthropic.com', apiKey, model, messages);
  }
  return callOpenAI(baseUrl || 'https://api.openai.com', apiKey, model, messages);
}

async function callAnthropic(base, apiKey, model, messages) {
  const res = await fetch(`${base}/v1/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model, max_tokens: 4096, messages }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic API 错误 ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.content[0].text;
}

async function callOpenAI(base, apiKey, model, messages) {
  const oaiMessages = messages.map(msg => {
    if (typeof msg.content === 'string') {
      return { role: msg.role, content: msg.content };
    }
    const parts = msg.content.map(part => {
      if (part.type === 'text') return { type: 'text', text: part.text };
      if (part.type === 'image') {
        const { media_type, data } = part.source;
        return { type: 'image_url', image_url: { url: `data:${media_type};base64,${data}` } };
      }
      return part;
    });
    return { role: msg.role, content: parts };
  });

  const res = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, max_tokens: 4096, messages: oaiMessages }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenAI API 错误 ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
}
