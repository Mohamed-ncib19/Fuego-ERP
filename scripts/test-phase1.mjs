/**
 * Phase 1 API smoke test — exercises the full orders & payments lifecycle
 * against a running standalone backend (http://127.0.0.1:3220).
 */
const BASE = "http://127.0.0.1:3220/api";
const API_KEY = "fuego-dev-api-key";

let cookie = "";

async function call(method, path, body, useCookie = true) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "x-api-key": API_KEY,
      "content-type": "application/json",
      ...(useCookie && cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    cookie = setCookie
      .split(/,(?=[^;]+?=)/)
      .map((c) => c.split(";")[0].trim())
      .join("; ");
  }
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

let failures = 0;
function check(name, cond, extra = "") {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.log(`  ✗ ${name} ${extra}`);
  }
}

async function main() {
  console.log("— login as admin —");
  // Try login or setup
  let statusRes = await call("GET", "/setup/status", null, false);
  if (statusRes.json.data?.needs_setup) {
    await call("POST", "/setup", {
      business_name: "Imprimerie Fuego",
      full_name: "Admin Principal",
      email: "admin@fuego.tn",
      password: "password1234",
    }, false);
  }

  // Attempt login with admin
  let loginRes = await call("POST", "/auth/login", {
    email: "admin@fuego.tn",
    password: "admin12345",
  }, false);

  if (loginRes.status !== 200) {
    // If different credentials exist, try default test user
    loginRes = await call("POST", "/auth/login", {
      email: "z@z.tn",
      password: "password1234",
    }, false);
  }

  check("authenticated session", loginRes.status === 200, JSON.stringify(loginRes.json));

  console.log("— orders lifecycle —");
  // 1. Create draft order
  const draftRes = await call("POST", "/orders", {
    customer_name: "Client Test Phase 1",
    customer_phone: "22000111",
    description: "Impression 500 affiches A3",
    order_type: "local",
  });
  check("draft order created", draftRes.status === 201 && draftRes.json.data?.status === "pending", JSON.stringify(draftRes.json));
  const orderId = draftRes.json.data?.id;

  // 2. Cannot confirm with 0 items
  const badConfirm = await call("POST", `/orders/${orderId}/confirm`, {});
  check("confirm refused with 0 items", badConfirm.status === 409, JSON.stringify(badConfirm.json));

  // 3. Update items
  const updateRes = await call("PATCH", `/orders/${orderId}`, {
    items: [
      { label: "Affiche A3 quadri", quantity: 500, unit_price: 200 }, // 100 DT
    ],
  });
  check("items added", updateRes.status === 200 && updateRes.json.data?.total_amount === 100000);

  // 4. Confirm with advance
  const confirmRes = await call("POST", `/orders/${orderId}/confirm`, {
    advance_amount: 30000,
    note: "Espèces au comptoir",
  });
  check("order confirmed with advance", confirmRes.status === 201 && confirmRes.json.data?.status === "confirmed" && confirmRes.json.data?.paid === 30000);

  // 5. Start order
  const startRes = await call("POST", `/orders/${orderId}/start`, {});
  check("order in_progress", startRes.status === 201 && startRes.json.data?.status === "in_progress");

  // 6. Ready order
  const readyRes = await call("POST", `/orders/${orderId}/ready`, {});
  check("order ready", readyRes.status === 201 && readyRes.json.data?.status === "ready");

  // 7. Deliver without paying reste -> 409
  const badDeliver = await call("POST", `/orders/${orderId}/deliver`, {});
  check("unpaid delivery refused", badDeliver.status === 409, JSON.stringify(badDeliver.json));

  // 8. Record balance payment
  const payRes = await call("POST", `/orders/${orderId}/payments`, {
    kind: "balance",
    amount: 70000,
    note: "Solde par carte",
  });
  check("balance paid", payRes.status === 201 && payRes.json.data?.reste === 0);

  // 9. Deliver succeeds
  const deliverRes = await call("POST", `/orders/${orderId}/deliver`, {});
  check("order delivered", deliverRes.status === 201 && deliverRes.json.data?.status === "delivered");

  // 10. List orders with filter
  const listRes = await call("GET", `/orders?search=Client+Test+Phase+1`);
  check("order listed in search", listRes.status === 200 && listRes.json.data?.length > 0);

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  } else {
    console.log("\n✓ All Phase 1 API checks passed!");
  }
}

main().catch((err) => {
  console.error("Test failed with exception:", err);
  process.exit(1);
});
