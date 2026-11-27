/**
 * Stock module — end-to-end checks against a running API (127.0.0.1:3220),
 * same style as test-phase1.mjs. Needs the admin account from the setup
 * wizard (admin@fuego.tn / admin12345). Uses unique names per run so it can
 * be re-run on the same database.
 *
 * Covers: manual material → stock, materials expense (single & multi-line)
 * → stock, other category → no stock, edit → correction, delete → reversal,
 * double submit (concurrent) → booked once, validation, history/balances.
 */
const BASE = "http://127.0.0.1:3220/api";
const KEY = process.env.FUEGO_API_KEY ?? "fuego-dev-api-key";
let cookie = "";
let failures = 0;

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "x-api-key": KEY, "content-type": "application/json", cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
  return { status: res.status, json: await res.json().catch(() => null) };
}

function check(name, cond, extra = "") {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.log(`  ✗ ${name} ${extra}`);
  }
}

const run = Date.now().toString(36);
const kg = (n) => Math.round(n * 1000);
const item = async (id) => (await call("GET", `/stock/items/${id}`)).json.data;

async function main() {
  console.log("— login —");
  let r = await call("POST", "/auth/login", { email: "admin@fuego.tn", password: "admin12345" });
  check("admin session", r.status === 200, JSON.stringify(r.json));

  console.log("— 1. raw material created manually —");
  r = await call("POST", "/stock/items", {
    name: `Tissu coton ${run}`,
    unit: "m",
    kind: "raw_material",
    category: "Tissus",
    min_threshold: kg(5),
    initial_quantity: kg(12),
  });
  check("created (201)", r.status === 201, JSON.stringify(r.json));
  const cotton = r.json.data;
  check("initial quantity in stock", cotton?.quantity === kg(12));
  r = await call("GET", "/stock/items?scope=materials");
  check("listed under Matières premières", r.json.data.some((i) => i.id === cotton.id));
  check("summary present", typeof r.json.meta?.summary?.total === "number");

  r = await call("POST", "/stock/items", { name: `  TÎSSU   coton ${run} `, unit: "m" });
  check("duplicate name refused (409)", r.status === 409);
  r = await call("POST", "/stock/items", { name: "X", unit: "parsec" });
  check("invalid unit refused (400)", r.status === 400);

  console.log("— 2/3. materials expense → stock (multi-line, inline new item) —");
  r = await call("POST", "/expenses", {
    category: "materials",
    note: "Facture test",
    lines: [
      { stock_item_id: cotton.id, quantity: kg(8), unit_price: 6_500 },
      { new_item: { name: `Encre rouge ${run}`, unit: "ml" }, quantity: kg(250), unit_price: 120 },
    ],
  });
  check("expense created", r.status === 201, JSON.stringify(r.json));
  const exp = r.json.data;
  check("amount = Σ lines", exp?.amount === 52_000 + 30_000, String(exp?.amount));
  check("lines preserved", exp?.lines?.length === 2 && exp.lines[0].unit_price === 6_500);
  check("cotton +8 m", (await item(cotton.id)).quantity === kg(20));
  const inkId = exp.lines.find((l) => l.item_name.startsWith("Encre"))?.stock_item_id;
  check("new material created with its stock", (await item(inkId))?.quantity === kg(250));

  console.log("— 4. other category leaves stock alone —");
  const before = (await call("GET", "/stock/items")).json.data.map((i) => `${i.id}:${i.quantity}`).join();
  r = await call("POST", "/expenses", { category: "utilities", amount: 80_000, note: "STEG" });
  check("utilities expense created", r.status === 201);
  const after = (await call("GET", "/stock/items")).json.data.map((i) => `${i.id}:${i.quantity}`).join();
  check("stock unchanged", before === after);
  r = await call("POST", "/expenses", {
    category: "rent",
    lines: [{ stock_item_id: cotton.id, quantity: 1000, unit_price: 1 }],
  });
  check("lines on another category refused (400)", r.status === 400);

  console.log("— 5. edit adjusts stock —");
  r = await call("PATCH", `/expenses/${exp.id}`, {
    lines: [{ stock_item_id: cotton.id, quantity: kg(10), unit_price: 6_500 }],
  });
  check("expense edited", r.status === 200, JSON.stringify(r.json));
  check("cotton 12 + 10", (await item(cotton.id)).quantity === kg(22));
  check("ink line removed → 0", (await item(inkId)).quantity === 0);
  r = await call("GET", `/stock/movements?expense_id=${exp.id}`);
  check(
    "corrections recorded",
    r.json.data.filter((m) => m.kind === "purchase_correction").length === 2,
  );

  console.log("— 6. delete reverses stock —");
  r = await call("DELETE", `/expenses/${exp.id}`);
  check("expense deleted", r.status === 200);
  check("cotton back to initial 12", (await item(cotton.id)).quantity === kg(12));
  r = await call("GET", `/stock/movements?item_id=${cotton.id}&limit=50`);
  check("history kept (reversal on top)", r.json.data[0]?.kind === "purchase_reversal");
  check("running balance shown", r.json.data[0]?.balance_after === kg(12));

  console.log("— 7. double submit (concurrent) books once —");
  const ref = `smoke-${run}`;
  const payload = {
    category: "materials",
    client_ref: ref,
    lines: [{ stock_item_id: cotton.id, quantity: kg(3), unit_price: 6_500 }],
  };
  const [a, b] = await Promise.all([call("POST", "/expenses", payload), call("POST", "/expenses", payload)]);
  check("both answered", a.status === 201 && b.status === 201, `${a.status}/${b.status}`);
  check("same expense returned", a.json.data?.id === b.json.data?.id);
  check("stock +3 only once", (await item(cotton.id)).quantity === kg(15));

  console.log("— 8. manual movements & validation —");
  r = await call("POST", `/stock/items/${cotton.id}/movements`, { type: "exit", quantity: kg(13), reason: "Commande" });
  check("exit recorded", r.status === 201 && r.json.data?.quantity === -kg(13));
  check("now low stock", (await item(cotton.id)).level === "low");
  r = await call("POST", `/stock/items/${cotton.id}/movements`, { type: "exit", quantity: kg(99) });
  check("over-exit refused (409)", r.status === 409);
  r = await call("DELETE", `/expenses/${a.json.data.id}`);
  check("reversal that would go negative refused (409)", r.status === 409, JSON.stringify(r.json));
  check("…and nothing changed", (await item(cotton.id)).quantity === kg(2));
  r = await call("POST", `/stock/items/${cotton.id}/movements`, { type: "count", quantity: kg(4.5) });
  check("inventory count (admin) → adjustment", r.status === 201 && r.json.data?.kind === "adjustment");
  r = await call("POST", `/stock/items/${cotton.id}/movements`, { type: "entry", quantity: 1.5 });
  check("non-integer quantity refused (400)", r.status === 400);

  console.log("— 10. existing expense listing intact —");
  r = await call("GET", "/expenses?limit=5");
  check("list ok with lines field", r.status === 200 && Array.isArray(r.json.data?.[0]?.lines));
  check("totalAmount still returned", typeof r.json.totalAmount === "number");
  r = await call("GET", "/finance/stats");
  check("finance stats ok", r.status === 200);

  console.log(failures ? `\n${failures} check(s) failed.` : "\n✓ All stock checks passed!");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
