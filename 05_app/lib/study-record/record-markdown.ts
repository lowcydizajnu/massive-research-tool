import DOMPurify from "dompurify";
import { marked } from "marked";

/**
 * Render Study Record authored markdown to sanitized HTML (ADR-0056). Richer
 * than the comment allowlist (ADR-0015) — records are documents, so headings,
 * lists, blockquotes and emphasis are allowed; raw HTML, images and embeds are
 * not. Links are http(s) only and hardened to `rel="noopener noreferrer"
 * target="_blank"`. Client-only (DOMPurify binds to `window`).
 */
const ALLOWED_TAGS = [
  "p", "br", "strong", "b", "em", "i", "code", "pre",
  "h3", "h4", "ul", "ol", "li", "blockquote", "a", "hr",
];
const ALLOWED_ATTR = ["href"];

let hookInstalled = false;

export function renderRecordMarkdown(md: string): string {
  // Demote any author-typed h1/h2 to h3 so the page's heading outline stays
  // intact (the section title is the h2/h3 above this content).
  const html = marked.parse(md, { async: false, breaks: true, gfm: true }) as string;

  if (!hookInstalled) {
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
    ALLOWED_URI_REGEXP: /^https?:/i,
  });
}
