import { useMutation } from '@tanstack/react-query';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, Send, Loader2, Upload as UploadIcon } from 'lucide-react';
import { api } from '../lib/api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AiResponse {
  response?: string;
  classifications?: Array<{ name: string; category: string; confidence: number }>;
  recommendations?: Array<{ product_id: string; name: string; score: number }>;
}

export function AIAssistantPage(): JSX.Element {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'assistant',
      content:
        'Hello! I can help you with:\n- **Product classification** — paste product names or upload a list\n- **Material recommendations** — describe your task and I\'ll suggest materials\n- **Supplier comparison** — ask about supplier pricing and scores\n\nHow can I help?',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const classify = useMutation({
    mutationFn: async (items: Array<{ name: string }>) => {
      const r = await api.post<AiResponse>('/api/ai/classify', { items });
      return r.data;
    },
  });

  const recommend = useMutation({
    mutationFn: async (task: string) => {
      const r = await api.post<AiResponse>('/api/ai/recommend', { task, limit: 8 });
      return r.data;
    },
  });

  const handleSend = useCallback(async () => {
    if (!input.trim()) return;
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };
    setMessages((m) => [...m, userMsg]);
    const query = input;
    setInput('');

    // Simple intent detection
    const lower = query.toLowerCase();
    let response = '';

    try {
      if (lower.includes('classif') || lower.includes('kategori') || lower.includes('einstufen')) {
        // Classification mode
        const items = query
          .split(/[,;\n]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .map((name) => ({ name }));
        if (items.length > 0) {
          const result = await classify.mutateAsync(items);
          if (result.classifications) {
            response = '**Classification results:**\n\n' +
              result.classifications
                .map((c) => `- **${c.name}** → ${c.category} (${(c.confidence * 100).toFixed(0)}%)`)
                .join('\n');
          }
        }
        if (!response) response = 'Please provide product names separated by commas to classify.';
      } else if (lower.includes('recommend') || lower.includes('empfehl') || lower.includes('suggest') || lower.includes('material')) {
        const result = await recommend.mutateAsync(query);
        if (result.recommendations && result.recommendations.length > 0) {
          response = '**Recommended materials:**\n\n' +
            result.recommendations
              .map((r, i) => `${i + 1}. **${r.name}** (score: ${r.score.toFixed(2)})`)
              .join('\n');
        } else {
          response = 'No specific recommendations found. Try describing your construction task in more detail.';
        }
      } else {
        // General query — try recommend as fallback
        const result = await recommend.mutateAsync(query);
        if (result.recommendations && result.recommendations.length > 0) {
          response = 'Based on your description, here are some suggestions:\n\n' +
            result.recommendations
              .map((r, i) => `${i + 1}. **${r.name}** (score: ${r.score.toFixed(2)})`)
              .join('\n');
        } else {
          response = 'I can help with product classification and material recommendations. Try:\n' +
            '- "Classify: Hilti HIT-HY 200, Fischer FIS V, Sika AnchorFix"\n' +
            '- "Recommend materials for concrete reinforcement on a bridge project"';
        }
      }
    } catch {
      response = 'Sorry, I encountered an error processing your request. Please try again.';
    }

    setMessages((m) => [
      ...m,
      {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      },
    ]);
  }, [input, classify, recommend]);

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      <div className="flex items-center gap-3 mb-4">
        <Bot size={24} className="text-brand" />
        <h1 className="text-2xl font-bold">AI Assistant</h1>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto card p-4 space-y-4 mb-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[75%] rounded-lg px-4 py-2 text-sm whitespace-pre-wrap ${msg.role === 'user'
                  ? 'bg-brand text-white'
                  : 'bg-brand-surface text-slate-800 border border-brand-line'
                }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {(classify.isPending || recommend.isPending) && (
          <div className="flex justify-start">
            <div className="bg-brand-surface rounded-lg px-4 py-2 text-sm border border-brand-line flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              Thinking...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-md border border-brand-line px-4 py-3 text-sm"
          placeholder="Ask about materials, classify products, or request recommendations..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <button
          className="btn-primary px-4"
          onClick={handleSend}
          disabled={!input.trim() || classify.isPending || recommend.isPending}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
