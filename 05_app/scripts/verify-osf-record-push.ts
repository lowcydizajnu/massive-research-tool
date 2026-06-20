/**
 * Live verification of the E4b Record→OSF push (ADR-0056 E4b), run against a
 * SACRIFICIAL OSF *project node*. Self-contained: it makes the exact PATCH that
 * `registry.osf.ts` `pushRecordSummary()` makes (body shape locked by the
 * adapter), so it validates the live OSF contract without touching the DB or the
 * token-encryption key. Non-destructive: it reads the node's current
 * description, pushes a test summary, confirms the change, then RESTORES the
 * original description.
 *
 * Usage:
 *   OSF_TOKEN=<personal-access-token> npx tsx scripts/verify-osf-record-push.ts <nodeId>
 *
 * The token needs osf.full_write and must belong to a contributor with write on
 * the node. <nodeId> is the 5-char OSF guid of a PROJECT node (e.g. the parent
 * of a sacrificial registration), NOT a registration id.
 */
const API_BASE = process.env.OSF_API_BASE ?? "https://api.osf.io/v2";
const JSON_API = "application/vnd.api+json";

async function getDescription(id: string, token: string): Promise<{ status: number; description?: string }> {
  const res = await fetch(`${API_BASE}/nodes/${id}/`, {
    headers: { Authorization: `Bearer ${token}`, Accept: JSON_API },
  });
  if (!res.ok) return { status: res.status };
  const node = (await res.json()) as { data: { attributes: { description?: string } } };
  return { status: res.status, description: node.data.attributes.description ?? "" };
}

async function patchDescription(id: string, token: string, description: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`${API_BASE}/nodes/${id}/`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": JSON_API, Accept: JSON_API },
    body: JSON.stringify({ data: { type: "nodes", id, attributes: { description } } }),
  });
  return { status: res.status, body: res.ok ? "" : (await res.text()).slice(0, 800) };
}

async function main() {
  const token = process.env.OSF_TOKEN;
  const nodeId = process.argv[2];
  if (!token) throw new Error("Set OSF_TOKEN (a personal access token with osf.full_write).");
  if (!nodeId) throw new Error("Pass the sacrificial OSF project node id as the first argument.");

  const before = await getDescription(nodeId, token);
  console.log(`Node ${nodeId} — BEFORE: HTTP ${before.status}, description=${JSON.stringify(before.description)}`);
  if (before.status !== 200) throw new Error(`Could not read node ${nodeId} (HTTP ${before.status}). Check the id + token.`);

  const original = before.description ?? "";
  const stamp = new Date().toISOString();
  const testSummary = `E4b smoke-test — record summary push at ${stamp}\n\nAbstract: a sacrificial verification of the OSF node-description push path.`;

  const push = await patchDescription(nodeId, token, testSummary);
  console.log(`PATCH push → HTTP ${push.status}`);
  if (push.status !== 200) {
    console.log("Response body:", push.body);
    throw new Error("✗ E4b push REJECTED — the node-description PATCH did not succeed.");
  }

  const after = await getDescription(nodeId, token);
  const ok = after.description === testSummary;
  console.log(`Node ${nodeId} — AFTER: HTTP ${after.status}, matched=${ok}`);

  // Restore the original description (non-destructive smoke test).
  const restore = await patchDescription(nodeId, token, original);
  console.log(`Restore original description → HTTP ${restore.status}`);

  console.log(
    ok && restore.status === 200
      ? "✓ E4b push verified live: the node description was updated and then restored."
      : "⚠ Push succeeded but verification/restore was incomplete — inspect the node on osf.io.",
  );
  if (!ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
