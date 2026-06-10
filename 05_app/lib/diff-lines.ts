/**
 * Line-level LCS diff (ADR-0031) — old vs new line arrays → GitHub-style rows.
 * Hand-rolled (no dependency): protocols are short documents, so the O(n·m)
 * DP is trivial. "removed" rows come from `oldLines`, "added" from `newLines`,
 * "same" from both; order interleaves removals before additions per hunk.
 */
export type DiffLine = { type: "same" | "added" | "removed"; text: string };

export function diffLines(oldLines: string[], newLines: string[]): DiffLine[] {
  const n = oldLines.length;
  const m = newLines.length;
  // lcs[i][j] = LCS length of oldLines[i..] vs newLines[j..]
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        oldLines[i] === newLines[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      out.push({ type: "same", text: oldLines[i] });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ type: "removed", text: oldLines[i] });
      i += 1;
    } else {
      out.push({ type: "added", text: newLines[j] });
      j += 1;
    }
  }
  while (i < n) out.push({ type: "removed", text: oldLines[i++] });
  while (j < m) out.push({ type: "added", text: newLines[j++] });
  return out;
}
