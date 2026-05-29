/**
 * messages 格式使用 Anthropic 规范：
 * [{ role: 'user', content: string | Array<{type:'text',text:string}|{type:'image',source:{type:'base64',media_type:string,data:string}}> }]
 * OpenAI-compatible 调用时自动转换。
 */

const ANTHROPIC_PROVIDERS = new Set(['anthropic', 'custom-anthropic']);

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
