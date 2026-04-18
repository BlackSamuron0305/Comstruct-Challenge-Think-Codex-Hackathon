import { useMutation } from '@tanstack/react-query';
import { Loader2, Send, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../lib/api';
import { Button } from './ui/button';

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

const WELCOME_MESSAGE: Message = {
  id: '0',
  role: 'assistant',
  content:
    'Hello! I can help you with:\n- Product classification\n- Material recommendations\n- Supplier comparison\n\nHow can I help?',
  timestamp: new Date(),
};

type AIAssistantChatProps = {
  mode?: 'page' | 'widget';
};

export function AIAssistantChat({
  mode = 'page',
}: AIAssistantChatProps): JSX.Element {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const isWidget = mode === 'widget';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const classify = useMutation({
    mutationFn: async (items: Array<{ name: string }>) => {
      const response = await api.post<AiResponse>('/api/ai/classify', { items });
      return response.data;
    },
  });

  const recommend = useMutation({
    mutationFn: async (task: string) => {
      const response = await api.post<AiResponse>('/api/ai/recommend', { task, limit: 8 });
      return response.data;
    },
  });

  const handleSend = useCallback(async () => {
    if (!input.trim()) return;

    const query = input.trim();
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: query,
      timestamp: new Date(),
    };

    setMessages((current) => [...current, userMessage]);
    setInput('');

    const lower = query.toLowerCase();
    let response = '';

    try {
      if (lower.includes('classif') || lower.includes('kategori') || lower.includes('einstufen')) {
        const items = query
          .split(/[,;\n]/)
          .map((value) => value.trim())
          .filter(Boolean)
          .map((name) => ({ name }));

        if (items.length > 0) {
          const result = await classify.mutateAsync(items);
          if (result.classifications?.length) {
            response =
              'Classification results:\n\n' +
              result.classifications
                .map((item) => `- ${item.name} -> ${item.category} (${(item.confidence * 100).toFixed(0)}%)`)
                .join('\n');
          }
        }

        if (!response) {
          response = 'Please send product names separated by commas so I can classify them.';
        }
      } else if (
        lower.includes('recommend') ||
        lower.includes('empfehl') ||
        lower.includes('suggest') ||
        lower.includes('material')
      ) {
        const result = await recommend.mutateAsync(query);
        if (result.recommendations?.length) {
          response =
            'Recommended materials:\n\n' +
            result.recommendations
              .map((item, index) => `${index + 1}. ${item.name} (score: ${item.score.toFixed(2)})`)
              .join('\n');
        } else {
          response = 'No specific recommendations found yet. Try describing the construction task in more detail.';
        }
      } else {
        const result = await recommend.mutateAsync(query);
        if (result.recommendations?.length) {
          response =
            'Based on your description, here are some suggestions:\n\n' +
            result.recommendations
              .map((item, index) => `${index + 1}. ${item.name} (score: ${item.score.toFixed(2)})`)
              .join('\n');
        } else {
          response =
            'I can help with product classification and material recommendations. Try:\n' +
            '- Classify: Hilti HIT-HY 200, Fischer FIS V, Sika AnchorFix\n' +
            '- Recommend materials for concrete reinforcement on a bridge project';
        }
      }
    } catch {
      response = 'Sorry, I hit an error while processing that request. Please try again.';
    }

    setMessages((current) => [
      ...current,
      {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      },
    ]);
  }, [classify, input, recommend]);

  const isPending = classify.isPending || recommend.isPending;

  return (
    <div className={`flex h-full min-h-0 flex-col ${isWidget ? '' : 'gap-4'}`}>
      <div
        className={`flex items-start justify-between gap-3 ${
          isWidget ? 'border-b border-brand-line/70 px-4 py-4' : ''
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand text-brand-surface shadow-[0_12px_24px_rgba(45,112,128,0.28)]">
            <Sparkles size={18} />
          </div>
          <div>
            <h1 className={`${isWidget ? 'text-base' : 'text-2xl'} font-bold text-slate-900`}>
              AI Assistant
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Ask about materials, suppliers, or product classification.
            </p>
          </div>
        </div>
        {isWidget ? (
          <Link
            to="/ai"
            className="rounded-full border border-brand-line bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-brand/40 hover:text-brand"
          >
            Full page
          </Link>
        ) : null}
      </div>

      <div className={`${isWidget ? 'flex-1 min-h-0 px-4 pt-4' : 'flex-1 min-h-0'}`}>
        <div
          className={`card flex h-full min-h-0 flex-col ${
            isWidget ? 'rounded-[22px] border-white/20 bg-white/75 p-3' : 'p-4'
          }`}
        >
          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${
                    message.role === 'user'
                      ? 'bg-brand text-brand-surface'
                      : 'border border-brand-line bg-brand-surface text-slate-800'
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}

            {isPending ? (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl border border-brand-line bg-brand-surface px-4 py-3 text-sm text-slate-700">
                  <Loader2 size={14} className="animate-spin" />
                  Thinking...
                </div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>

          <div className="mt-4 flex gap-2">
            <input
              className="min-w-0 flex-1 rounded-[16px] border border-brand-line px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand/50 focus:ring-2 focus:ring-brand/10"
              style={{ backgroundColor: '#FFFFFF' }}
              placeholder="Ask the assistant..."
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
            />
            <Button
              className="h-auto rounded-[16px] px-4"
              onClick={() => void handleSend()}
              disabled={!input.trim() || isPending}
              aria-label="Send message"
            >
              <Send size={16} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
