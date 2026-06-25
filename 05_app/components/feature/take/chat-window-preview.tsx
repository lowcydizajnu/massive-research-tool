import { Bot } from "lucide-react";

import { BUBBLE_TOKENS, FONT_STACKS, RADIUS_PX, resolveChat, type ChatAppearance } from "@/lib/themes/themes";

/**
 * Static (non-interactive) chat-window render driven by the chat appearance
 * (ADR-0065). Used in the participant preview (no session/model) AND the
 * Design → Chat live preview, so the look is defined once. Shows the header,
 * the AI-disclosure line, the opening message + a sample participant bubble,
 * and a disabled composer.
 */
export function ChatWindowPreview({
  chat,
  openingMessage = "",
  note,
}: {
  chat?: ChatAppearance;
  openingMessage?: string;
  /** Optional muted line under the messages (e.g. "preview doesn't connect to the model"). */
  note?: string;
}) {
  const a = chat ?? resolveChat({});
  const radius = RADIUS_PX[a.bubbleRadius];
  const asst = BUBBLE_TOKENS[a.assistantBubble];
  const user = BUBBLE_TOKENS[a.participantBubble];
  const pad = a.density === "compact" ? "px-3 py-1.5" : "px-3.5 py-2";
  const gap = a.density === "compact" ? "gap-1.5" : "gap-2.5";
  const fontFamily = a.font ? FONT_STACKS[a.font] : undefined;

  const avatar = a.avatarKey ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/api/media/${a.avatarKey}`} alt="" className="size-6 rounded-full object-cover" />
  ) : (
    <span className="flex size-6 items-center justify-center rounded-full bg-[var(--color-primary)] text-white">
      <Bot className="size-3.5" aria-hidden />
    </span>
  );

  return (
    <div
      className="flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)]"
      style={fontFamily ? { fontFamily } : undefined}
    >
      <div className="flex items-center gap-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] px-3 py-2 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
        {avatar}
        {a.assistantName || "Assistant"}
      </div>
      {a.aiDisclosure && a.aiDisclosureText.trim() ? (
        <p className="border-b border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          {a.aiDisclosureText}
        </p>
      ) : null}
      <div className={`flex flex-col ${gap} p-3`}>
        {openingMessage.trim() ? (
          <span className={`max-w-[80%] self-start whitespace-pre-wrap ${pad} text-[length:var(--text-body)]`} style={{ background: asst.bg, color: asst.text, borderRadius: radius, borderBottomLeftRadius: "4px" }}>
            {openingMessage}
          </span>
        ) : null}
        <span className={`max-w-[80%] self-end ${pad} text-[length:var(--text-body)]`} style={{ background: user.bg, color: user.text, borderRadius: radius, borderBottomRightRadius: "4px" }}>
          {a.participantLabel === "You" ? "A participant reply…" : `${a.participantLabel}: a reply…`}
        </span>
        {note ? <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{note}</p> : null}
      </div>
      <div className="border-t border-[var(--color-border-subtle)] p-3">
        <input
          disabled
          placeholder={a.placeholder || "Type your reply…"}
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 text-[length:var(--text-body)] text-[var(--color-text-muted)] opacity-60"
        />
      </div>
    </div>
  );
}
