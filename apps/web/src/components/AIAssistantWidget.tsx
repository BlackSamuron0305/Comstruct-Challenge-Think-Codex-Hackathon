import { Bot, MessageCircleMore, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { AIAssistantChat } from './AIAssistantChat';

export function AIAssistantWidget(): JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event: MouseEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="pointer-events-none fixed inset-x-3 bottom-3 z-40 flex items-end justify-end lg:inset-x-auto lg:bottom-4 lg:right-4"
    >
      <div className="pointer-events-auto relative flex items-end gap-3">
        {open ? (
          <div className="h-[min(34rem,calc(100vh-6rem))] w-[min(24rem,calc(100vw-6rem))] overflow-hidden rounded-[28px] border border-brand-line/70 bg-[color:rgba(240,242,242,0.96)] shadow-[0_24px_80px_rgba(15,23,42,0.18)] backdrop-blur">
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex items-center justify-end px-4 pt-3">
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-brand-line bg-white/70 text-slate-700 transition hover:border-brand/40 hover:text-brand"
                  onClick={() => setOpen(false)}
                  aria-label="Close assistant"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="min-h-0 flex-1 pb-4">
                <AIAssistantChat mode="widget" />
              </div>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          className={`group relative inline-flex h-14 w-14 items-center justify-center rounded-full border transition ${
            open
              ? 'border-brand bg-brand text-brand-surface shadow-[0_16px_36px_rgba(45,112,128,0.32)]'
              : 'border-brand-line bg-white/90 text-brand shadow-[0_14px_34px_rgba(15,23,42,0.12)] hover:border-brand/40 hover:-translate-y-0.5 hover:shadow-[0_20px_44px_rgba(15,23,42,0.16)]'
          }`}
          onClick={() => setOpen((current) => !current)}
          aria-label={open ? 'Close AI assistant' : 'Open AI assistant'}
          aria-expanded={open}
        >
          <Bot size={22} />
          {!open ? (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-accent px-1 text-[10px] font-bold text-slate-900">
              AI
            </span>
          ) : null}
        </button>

        {!open ? (
          <div className="max-w-[10rem] rounded-2xl border border-brand-line/70 bg-white/90 px-3 py-2 text-xs font-medium text-slate-700 shadow-[0_12px_28px_rgba(15,23,42,0.10)] backdrop-blur">
            <div className="flex items-center gap-2">
              <MessageCircleMore size={14} className="text-brand" />
              Chat with AI assistant
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
