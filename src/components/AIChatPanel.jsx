import { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, Send, X } from 'lucide-react';
import { callAI } from '../lib/ai-import/aiClient.js';
import { buildChatMessages, parseChatResponse } from '../lib/ai-import/fieldMapper.js';
import { AIChangesPreviewModal } from './AIChangesPreviewModal.jsx';

export function AIChatPanel({ customer, aiSettings, onApplyChanges }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingChanges, setPendingChanges] = useState(null);
  const endRef = useRef();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text }]);
    setLoading(true);

    try {
      const apiMessages = buildChatMessages(customer, text);
      const raw = await callAI(aiSettings, apiMessages);
      const parsed = parseChatResponse(raw);
      setMessages(prev => [...prev, { role: 'assistant', text: parsed.reply, changes: parsed.changes }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'system', text: `错误：${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const handleApply = (changes) => {
    onApplyChanges(changes);
    setPendingChanges(null);
    setMessages(prev => [...prev, { role: 'system', text: `✓ 已应用 ${changes.length} 条变更。` }]);
  };

  const hasKey = Boolean(aiSettings?.apiKey);

  return (
    <>
      <button
        className="ai-fab"
        onClick={() => setOpen(o => !o)}
        title="AI 助手"
        aria-label="打开 AI 助手"
      >
        <Bot size={22} />
      </button>

      {open && (
        <div className="ai-chat-panel">
          <div className="ai-chat-header">
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Bot size={15} />
              AI 助手 · {customer?.name ?? '请先选择客户'}
            </span>
            <button className="icon-button" onClick={() => setOpen(false)} title="关闭">
              <X size={15} />
            </button>
          </div>

          <div className="ai-chat-messages">
            {messages.length === 0 && (
              <p className="ai-chat-hint">
                {hasKey
                  ? `你好！我可以帮你查询或修改 ${customer?.name ?? '客户'} 的产品和订单数据。`
                  : '请先在顶栏 AI 设置（机器人图标）中填写 API Key。'}
              </p>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`ai-bubble ai-bubble--${msg.role}`}>
                <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{msg.text}</p>
                {msg.changes?.length > 0 && (
                  <button
                    className="ghost-button compact"
                    style={{ marginTop: 8, fontSize: 12 }}
                    onClick={() => setPendingChanges(msg.changes)}
                  >
                    预览变更（{msg.changes.length} 条）
                  </button>
                )}
              </div>
            ))}
            {loading && (
              <div className="ai-bubble ai-bubble--assistant">
                <Loader2 size={14} style={{ animation: 'spin 0.9s linear infinite' }} />
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="ai-chat-input-row">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={hasKey ? '输入指令，例如：把所有待确认订单改为生产中' : '请先配置 API Key'}
              disabled={loading || !hasKey || !customer}
            />
            <button
              className="primary-action compact"
              onClick={send}
              disabled={loading || !input.trim() || !hasKey || !customer}
              title="发送（Enter）"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      )}

      {pendingChanges && customer && (
        <AIChangesPreviewModal
          changes={pendingChanges}
          customer={customer}
          onConfirm={handleApply}
          onClose={() => setPendingChanges(null)}
        />
      )}
    </>
  );
}
