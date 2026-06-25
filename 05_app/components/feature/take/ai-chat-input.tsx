"use client";

import { Bot, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { aiChatTurnAction } from "@/app/(take)/take/[studyId]/actions";
import { BUBBLE_TOKENS, FONT_STACKS, RADIUS_PX, resolveChat, type ChatAppearance } from "@/lib/themes/themes";

type Msg = { role: "user" | "assistant"; content: string };

/**
 * Participant-facing AI conversation (ADR-0061) — a real chat window styled by the
 * study's chat appearance (ADR-0065, Design → Chat): assistant name + avatar,
 * token-based bubble colours/shape, density, font, AI-disclosure line, composer
 * placeholder, typing-indicator toggle. Manages the exchange (server action →
 * Claude), enforces the turn cap + time limit, and mirrors the transcript into a
 * hidden input so Continue saves it via the normal answer path.
 */
export function AiChatInput({
  config,
  responseId,
  blockInstanceId,
  np = "",
  chat,
}: {
  config: Record<string, unknown>;
  responseId: string;
  blockInstanceId: string;
  np?: string;
  chat?: ChatAppearance;
}) {
  const a = chat ?? resolveChat({});
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

  useEffect(() => {
    if (timeLimitSec <= 0) return;
    const t = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, [timeLimitSec]);

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
            : res.error === "budget_exceeded"
              ? "This study's AI is temporarily unavailable. Please tell the researcher."
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

  const radius = RADIUS_PX[a.bubbleRadius];
  const asstBubble = BUBBLE_TOKENS[a.assistantBubble];
  const userBubble = BUBBLE_TOKENS[a.participantBubble];
  const gap = a.density === "compact" ? "gap-1.5" : "gap-2.5";
  const pad = a.density === "compact" ? "px-3 py-1.5" : "px-3.5 py-2";
  const fontFamily = a.font ? FONT_STACKS[a.font] : undefined;

  const Avatar = () =>
    a.avatarKey ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`/api/media/${a.avatarKey}`} alt="" className="size-6 shrink-0 self-end rounded-full object-cover" />
    ) : (
      <span className="flex size-6 shrink-0 items-center justify-center self-end rounded-full bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]">
        <Bot className="size-3.5" aria-hidden />
      </span>
    );

  return (
    <div
      className="flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] shadow-[var(--shadow-sm)]"
      style={fontFamily ? { fontFamily } : undefined}
    >
      <style>{"@keyframes mrtBubble{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}"}</style>

      <input type="hidden" name={`${np}aichat`} value={JSON.stringify(transcript)} readOnly />

      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] px-3 py-2">
        <span className="flex items-center gap-2 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
          {a.avatarKey ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/media/${a.avatarKey}`} alt="" className="size-6 rounded-full object-cover" />
          ) : (
            <span className="flex size-6 items-center justify-center rounded-full bg-[var(--color-primary)] text-white">
              <Bot className="size-3.5" aria-hidden />
            </span>
          )}
          {a.assistantName || "Assistant"}
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

      {a.aiDisclosure && a.aiDisclosureText.trim() ? (
        <p className="border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          {a.aiDisclosureText}
        </p>
      ) : null}

      {/* Messages */}
      <div ref={scrollRef} className={`flex max-h-[55vh] min-h-[12rem] flex-col ${gap} overflow-y-auto p-3`}>
        {transcript.length === 0 ? (
          <p className="m-auto text-[length:var(--text-small)] text-[var(--color-text-muted)]">Say hello to begin.</p>
        ) : (
          transcript.map((m, i) => (
            <div
              key={i}
              className={m.role === "user" ? "flex justify-end" : "flex items-end gap-2 justify-start"}
              style={{ animation: "mrtBubble .25s ease-out" }}
            >
              {m.role === "assistant" ? <Avatar /> : null}
              <span
                className={`max-w-[80%] whitespace-pre-wrap ${pad} text-[length:var(--text-body)]`}
                style={
                  m.role === "user"
                    ? { background: userBubble.bg, color: userBubble.text, borderRadius: radius, borderBottomRightRadius: "4px" }
                    : { background: asstBubble.bg, color: asstBubble.text, borderRadius: radius, borderBottomLeftRadius: "4px" }
                }
              >
                {m.content}
              </span>
            </div>
          ))
        )}
        {busy && a.typingIndicator ? (
          <div className="flex items-end gap-2" aria-label="Assistant is typing">
            <Avatar />
            <span className="flex items-center gap-1 px-3.5 py-3" style={{ background: asstBubble.bg, borderRadius: radius, borderBottomLeftRadius: "4px" }}>
              {[0, 1, 2].map((d) => (
                <span key={d} className="size-1.5 animate-bounce rounded-full bg-[var(--color-text-muted)]" style={{ animationDelay: `${d * 0.15}s` }} />
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
              placeholder={a.placeholder || "Type your reply…"}
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
