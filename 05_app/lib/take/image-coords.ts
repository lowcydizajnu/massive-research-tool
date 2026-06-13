/**
 * Normalize a pointer/click position to 0..1 fractions of an element's box
 * (ADR-0041) — coordinates stored this way survive responsive resize, retina,
 * and re-display at any width. Pure; clamps to [0,1].
 */
export function normalizedPoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
  const x = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
  const y = rect.height > 0 ? (clientY - rect.top) / rect.height : 0;
  const clamp = (n: number) => Math.min(1, Math.max(0, Math.round(n * 1000) / 1000));
  return { x: clamp(x), y: clamp(y) };
}
