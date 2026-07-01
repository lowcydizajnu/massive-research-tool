/**
 * Social-post engagement cell formatters (ADR-0085 amendment 2026-07-01). Kept pure
 * and separate from the DB-bound getResults builder so the reply→comment linkage and
 * the comment-likes formatting are unit-testable. getResults calls these to fill
 * `spreplies:<inst>` / `spcommentlikes:<inst>` in row.answers; dataset.ts then emits
 * the columns.
 */

/** A participant reply as stored on the social-post answer. The object form carries
 *  the parent comment's label (`to` = author + snippet); the bare-string form is
 *  legacy data recorded before the amendment (no parent link). */
type StoredReply = string | { to?: unknown; text?: unknown };

/**
 * Join a respondent's replies into one export cell, each prefixed with the comment it
 * answered: `[re: <label>] <reply>`. Legacy string replies (pre-amendment, no parent)
 * render as bare text. Blank replies are dropped; the result is " | "-joined.
 */
export function formatReplyCell(replies: unknown): string {
  if (!Array.isArray(replies)) return "";
  return (replies as StoredReply[])
    .map((r) => {
      if (typeof r === "string") return r.trim();
      if (r && typeof r === "object") {
        const to = String((r as { to?: unknown }).to ?? "").trim();
        const text = String((r as { text?: unknown }).text ?? "").trim();
        return text ? (to ? `[re: ${to}] ${text}` : text) : "";
      }
      return "";
    })
    .filter((s) => s !== "")
    .join(" | ");
}

/** Join the labels of the seeded comments a respondent Liked into one export cell. */
export function formatCommentLikesCell(likes: unknown): string {
  if (!Array.isArray(likes)) return "";
  return (likes as unknown[])
    .map(String)
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .join(" | ");
}
