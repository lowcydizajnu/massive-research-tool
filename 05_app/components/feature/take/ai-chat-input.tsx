"use client";

import { Bot, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { aiChatTurnAction } from "@/app/(take)/take/[studyId]/actions";

type Msg = { role: "user" | "assistant"; content: string };

/**
 * Participant-facing AI conversation (ADR-0061) — a real chat window: header with
 * the assistant avatar + a live reply/time budget, scrolling message bubbles, an
 * animated "typing" indicator while the model thinks, and auto-scroll. Manages
 * the exchange in state (server action → Claude via the workspace key), enforces
 * the turn cap + an optional time limit, and mirrors the full transcript into a
 * hidden input so the screen's Continue saves it through the normal answer path.
 */
export function AiChatInput({
  config,
  responseId,
  blockInstanceId,
  np = "",
}: {
  config: Record<string, unknown>;
  responseId: string;
  blockInstanceId: string;
  np?: string;
}) {
  const opening = typeof config.openingMessage === "string" ? config.openingMessage.trim() : "";
  const maxTurns = typeof config.maxTurns === "number" ? config.maxTurns : 8;
  const timeLimitSec = typeof config.timeLimitSec === "number" ? config.timeLimitSec : 0;

  const [exchange, setExchange] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(timeLimitSec);
  const scrollRef = useRef<HTMLDivElement>(null);

  const userTurns = exchange.filter((m) => m.role === "user").length;
  const timeUp = timeLimitSec > 0 && remaining <= 0;
  const done = userTurns >= maxTurns || timeUp;
  const transcript: Msg[] = [...(opening ? [{ role: "assistant" as const, content: opening }] : []), ...exchange];

  // Countdown (only when a limit is set).
  useEffect(() => {
    if (timeLimitSec <= 0) return;
    const t = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, [timeLimitSec]);

  // Auto-scroll to the newest message / typing indicator.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript.length, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy || done) return;
    setBusy(true);
    setError(null);
    const optimistic = [...exchange, { role: "user" as const, content: text }];
    setExchange(optimistic);
    setInput("");
    try {
      const res = await aiChatTurnAction({ responseId, blockInstanceId, history: exchange, userMessage: text });
      if (res.ok) setExchange([...optimistic, { role: "assistant", content: res.reply }]);
      else {
        setError(
          res.error === "no_provider_key"
            ? "This study's AI isn't configured yet. Please tell the researcher."
            : res.error === "throttled"
              ? "One moment — sending too fast."
              : "Sorry, the assistant couldn't respond. Try again.",
        );
        setExchange(exchange);
      }
    } catch {
      setError("Sorry, the assistant couldn't respond. Try again.");
      setExchange(exchange);
    } finally {
      setBusy(false);
    }
  }

  const mm = Math.floor(remaining / 60);
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <div className="flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] shadow-[var(--shadow-sm)]">
      <style>{"@keyframes mrtBubble{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}"}</style>

      {/* Hidden transcript carried to the answer via the normal screen submit. */}
      <input type="hidden" name={`${np}aichat`} value={JSON.stringify(transcript)} readOnly />

      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] px-3 py-2">
        <span className="flex items-center gap-2 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
          <span className="flex size-6 items-center justify-center rounded-full bg-[var(--color-primary)] text-white">
            <Bot className="size-3.5" aria-hidden />
          </span>
          Assistant
          {busy ? <span className="text-[length:var(--text-small)] font-normal text-[var(--color-text-muted)]">typing…</span> : null}
        </span>
        <span className="flex items-center gap-3 text-[length:var(--text-small)] text-[var(--color-text-muted)] tabular-nums">
          {timeLimitSec > 0 ? (
            <span className={timeUp ? "text-[var(--color-danger)]" : remaining <= 30 ? "text-[var(--color-warning-text-on-subtle)]" : ""}>
              ⏱ {mm}:{ss}
            </span>
          ) : null}
          <span>{userTurns}/{maxTurns}</span>
        </span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex max-h-[55vh] min-h-[12rem] flex-col gap-2.5 overflow-y-auto p-3">
        {transcript.length === 0 ? (
          <p className="m-auto text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Say hello to begin.
          </p>
        ) : (
          transcript.map((m, i) => (
            <div
              key={i}
              className={m.role === "user" ? "flex justify-end" : "flex items-end gap-2 justify-start"}
              style={{ animation: "mrtBubble .25s ease-out" }}
            >
              {m.role === "assistant" ? (
                <span className="flex size-6 shrink-0 items-center justify-center self-end rounded-full bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]">
                  <Bot className="size-3.5" aria-hidden />
                </span>
              ) : null}
              <span
                className={
                  m.role === "user"
                    ? "max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-[var(--color-primary)] px-3.5 py-2 text-[length:var(--text-body)] text-white"
                    : "max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-[var(--color-surface-subtle)] px-3.5 py-2 text-[length:var(--text-body)] text-[var(--color-text-primary)]"
                }
              >
                {m.content}
              </span>
            </div>
          ))
        )}
        {busy ? (
          <div className="flex items-end gap-2" aria-label="Assistant is typing">
            <span className="flex size-6 shrink-0 items-center justify-center self-end rounded-full bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]">
              <Bot className="size-3.5" aria-hidden />
            </span>
            <span className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-[var(--color-surface-subtle)] px-3.5 py-3">
              {[0, 1, 2].map((d) => (
                <span
                  key={d}
                  className="size-1.5 animate-bounce rounded-full bg-[var(--color-text-muted)]"
                  style={{ animationDelay: `${d * 0.15}s` }}
                />
              ))}
            </span>
          </div>
        ) : null}
      </div>

      {/* Composer */}
      <div className="border-t border-[var(--color-border-subtle)] p-3">
        {error ? (
          <p role="alert" className="mb-2 text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
            {error}
          </p>
        ) : null}
        {done ? (
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            {timeUp ? "Time's up — " : "Thanks — "}that&rsquo;s the end of the conversation. Continue below.
          </p>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              disabled={busy}
              placeholder="Type your reply…"
              className="min-h-[2.5rem] min-w-0 flex-1 resize-none rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 text-[length:var(--text-body)] text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)] disabled:opacity-60"
            />
            <button
              type="button"
              onClick={send}
              disabled={busy || !input.trim()}
              aria-label="Send"
              className="rounded-full bg-[var(--color-primary)] p-2.5 text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Send className="size-4" aria-hidden />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
