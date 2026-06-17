/**
 * Live verification of OSF registration withdrawal (ADR-0005 am. 3), run against
 * a SACRIFICIAL registration. Self-contained: it makes the exact PATCH that
 * `registry.osf.ts` `withdraw()` makes (body shape locked by the adapter unit
 * test), so it validates the live OSF contract without touching the DB or the
 * token-encryption key.
 *
 * Usage:
 *   OSF_TOKEN=<personal-access-token> npx tsx scripts/verify-osf-withdraw.ts \
 *     "10.17605/OSF.IO/RXZQA" "Sacrificial test withdrawal — verifying the API path"
 *
 * The token needs osf.full_write and must belong to an ADMIN contributor of the
 * registration. WARNING: withdrawal is irreversible — only run against a
 * registration you intend to retract.
 */
const API_BASE = process.env.OSF_API_BASE ?? "https://api.osf.io/v2";
const JSON_API = "application/vnd.api+json";

function osfIdFromDoi(doi: string): string | null {
  const m = doi.match(/OSF\.IO\/(\w+)/i);
  if (m) return m[1].toLowerCase();
  return /^\w+$/.test(doi.trim()) ? doi.trim().toLowerCase() : null;
}

async function getStatus(id: string, token: string) {
  const res = await fetch(`${API_BASE}/registrations/${id}/`, {
    headers: { Authorization: `Bearer ${token}`, Accept: JSON_API },
  });
  if (!res.ok) return { lookupStatus: res.status };
  const reg = (await res.json()) as {
    data: { attributes: Record<string, unknown> };
  };
  const a = reg.data.attributes;
  return {
    withdrawn: a.withdrawn,
    pending_withdrawal: a.pending_withdrawal,
    public: a.public,
    withdrawal_justification: a.withdrawal_justification,
  };
}

async function main() {
  const token = process.env.OSF_TOKEN;
  const doi = process.argv[2] ?? "10.17605/OSF.IO/RXZQA";
  const reason = process.argv[3] ?? "Sacrificial test withdrawal — verifying the OSF API path (ADR-0005 am. 3).";
  if (!token) throw new Error("Set OSF_TOKEN (a personal access token with osf.full_write).");
  const id = osfIdFromDoi(doi);
  if (!id) throw new Error(`Could not derive an OSF registration id from "${doi}".`);

  console.log(`Registration ${id} — BEFORE:`, await getStatus(id, token));

  const res = await fetch(`${API_BASE}/registrations/${id}/`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": JSON_API, Accept: JSON_API },
    body: JSON.stringify({
      data: { type: "registrations", id, attributes: { pending_withdrawal: true, withdrawal_justification: reason } },
    }),
  });
  const body = await res.text();
  console.log(`PATCH withdraw → HTTP ${res.status}`);
  if (!res.ok) console.log("Response body:", body.slice(0, 1000));

  console.log(`Registration ${id} — AFTER:`, await getStatus(id, token));
  console.log(
    res.ok
      ? "✓ Withdrawal request accepted. If pending_withdrawal=true, OSF is now awaiting contributor approval (check email / osf.io)."
      : "✗ Withdrawal request rejected — see the response body above.",
  );
}

main().catch((e: unknown) => {
  console.error("verify-osf-withdraw failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
