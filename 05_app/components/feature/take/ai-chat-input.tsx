"use client";

import { Send } from "lucide-react";
import { useState } from "react";

import { aiChatTurnAction } from "@/app/(take)/take/[studyId]/actions";

type Msg = { role: "user" | "assistant"; content: string };

/**
 * Participant-facing AI conversation (ADR-0061). Manages the live exchange in
 * component state, calling the server action per message (which talks to Claude
 * via the workspace's BYO key + the block's role/context). The opening message is
 * display-only; the model history is the real exchange. The full transcript is
 * mirrored into a hidden input so the screen's Continue submits it through the
 * normal answer path. Continue is gated until at least one exchange completes.
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

  const [exchange, setExchange] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userTurns = exchange.filter((m) => m.role === "user").length;
  const done = userTurns >= maxTurns;
  const transcript: Msg[] = [...(opening ? [{ role: "assistant" as const, content: opening }] : []), ...exchange];

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
      if (res.ok) {
        setExchange([...optimistic, { role: "assistant", content: res.reply }]);
      } else {
        setError(
          res.error === "no_provider_key"
            ? "This study's AI isn't configured yet. Please tell the researcher."
            : res.error === "throttled"
              ? "One moment — sending too fast."
              : "Sorry, the assistant couldn't respond. Try again.",
        );
        setExchange(exchange); // roll back the optimistic user turn
      }
    } catch {
      setError("Sorry, the assistant couldn't respond. Try again.");
      setExchange(exchange);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Transcript carried to the answer via the normal screen submit. */}
      <input type="hidden" name={`${np}aichat`} value={JSON.stringify(transcript)} readOnly />

      <div className="flex max-h-[50vh] min-h-[8rem] flex-col gap-2 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-3">
        {transcript.length === 0 ? (
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Start the conversation below.
          </p>
        ) : (
          transcript.map((m, i) => (
            <div
              key={i}
              className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
            >
              <span
                className={
                  m.role === "user"
                    ? "max-w-[85%] whitespace-pre-wrap rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-2 text-[length:var(--text-body)] text-white"
                    : "max-w-[85%] whitespace-pre-wrap rounded-[var(--radius-md)] bg-[var(--color-surface-canvas)] px-3 py-2 text-[length:var(--text-body)] text-[var(--color-text-primary)]"
                }
              >
                {m.content}
              </span>
            </div>
          ))
        )}
        {busy ? (
          <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">…</span>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
          {error}
        </p>
      ) : null}

      {done ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Thanks — that&rsquo;s the end of the conversation. Continue below.
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
            rows={2}
            disabled={busy}
            placeholder="Type your reply…"
            className="min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 text-[length:var(--text-body)] text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)] disabled:opacity-60"
          />
          <button
            type="button"
            onClick={send}
            disabled={busy || !input.trim()}
            aria-label="Send"
            className="rounded-[var(--radius-md)] bg-[var(--color-primary)] p-2.5 text-white hover:opacity-90 disabled:opacity-50"
          >
            <Send className="size-4" aria-hidden />
          </button>
        </div>
      )}
      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        {userTurns}/{maxTurns} replies · this conversation is recorded as your answer.
      </p>
    </div>
  );
}
