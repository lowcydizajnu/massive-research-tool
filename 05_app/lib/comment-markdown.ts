import DOMPurify from "dompurify";
import { marked } from "marked";

/**
 * Render a comment's markdown to sanitized HTML with the ADR-0015 allowlist:
 * bold / italic / code (span + block) / links / line breaks / @mentions.
 * NOT allowed: images, headers, lists, raw HTML, embeds. Links are limited to
 * http(s)/mailto and always get rel="noopener noreferrer" target="_blank".
 *
 * Client-only — DOMPurify binds to `window`. Import from client components.
 */
const ALLOWED_TAGS = ["strong", "b", "em", "i", "code", "pre", "a", "br", "p"];
const ALLOWED_ATTR = ["href"];

let hookInstalled = false;

export function renderCommentMarkdown(md: string): string {
  const html = marked.parse(md, { async: false, breaks: true, gfm: true }) as string;

  if (!hookInstalled) {
    // Harden links: force safe rel/target on every anchor that survives sanitize.
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
      if (node.tagName === "A") {
        node.setAttribute("rel", "noopener noreferrer");
        node.setAttribute("target", "_blank");
      }
    });
    hookInstalled = true;
  }

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
  });
}
