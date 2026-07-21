/** SimpleFIN protocol client (v2, bridge.simplefin.org). Server-side only.
 *  Flow: user pastes a one-time Setup Token (base64 claim URL) -> we POST it
 *  once to claim a permanent Access URL (has Basic-auth creds embedded) ->
 *  all future reads are GET {accessUrl}/accounts. */

export async function claimAccessUrl(setupToken: string): Promise<string> {
  let claimUrl: string;
  try {
    claimUrl = Buffer.from(setupToken.trim(), "base64").toString("utf8").trim();
  } catch {
    throw new Error("That doesn't look like a SimpleFIN token");
  }
  if (!claimUrl.startsWith("https://") || !claimUrl.includes("/claim/")) {
    throw new Error("Invalid SimpleFIN token — copy the whole token from SimpleFIN Bridge");
  }
  const res = await fetch(claimUrl, { method: "POST" });
  if (res.status === 403) {
    throw new Error(
      "This token was already claimed or expired. Generate a fresh token at SimpleFIN Bridge (each token works exactly once)."
    );
  }
  if (!res.ok) throw new Error(`SimpleFIN claim failed (HTTP ${res.status})`);
  const accessUrl = (await res.text()).trim();
  if (!accessUrl.startsWith("https://")) {
    throw new Error("SimpleFIN returned an unexpected claim response");
  }
  return accessUrl;
}

export async function sfinGetAccounts(
  accessUrl: string,
  opts?: { startDate?: number; balancesOnly?: boolean }
): Promise<any> {
  const u = new URL(accessUrl);
  const auth = Buffer.from(
    `${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`
  ).toString("base64");
  u.username = "";
  u.password = "";
  const base = u.toString().replace(/\/+$/, "");
  const qs = new URLSearchParams();
  if (opts?.startDate) qs.set("start-date", String(opts.startDate));
  if (opts?.balancesOnly) qs.set("balances-only", "1");
  const url = `${base}/accounts${qs.toString() ? "?" + qs.toString() : ""}`;

  const res = await fetch(url, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });
  if (res.status === 403) {
    const err: any = new Error("SimpleFIN authentication failed — access may have been revoked");
    err.statusCode = 403;
    throw err;
  }
  if (res.status === 402) {
    const err: any = new Error("SimpleFIN subscription lapsed — renew at bridge.simplefin.org");
    err.statusCode = 402;
    throw err;
  }
  if (!res.ok) {
    throw new Error(`SimpleFIN ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

/** Human name for an account's institution, from the AccountSet connections list. */
export function connectionName(accountSet: any, account: any): string {
  const conns = accountSet?.connections ?? [];
  const c = conns.find((x: any) => x.conn_id === account.conn_id);
  return c?.name ?? c?.org_name ?? "Bank";
}
