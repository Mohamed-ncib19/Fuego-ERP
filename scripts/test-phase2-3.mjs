import http from "node:http";

function req(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`http://127.0.0.1:3220${path}`);
    const reqHeaders = {
      ...headers,
      "x-api-key": "fuego-dev-api-key",
    };
    let payload = null;
    if (body !== undefined && body !== null) {
      if (typeof body === "string") {
        payload = body;
      } else {
        payload = JSON.stringify(body);
        reqHeaders["content-type"] = "application/json";
      }
    }
    const r = http.request(
      url,
      {
        method,
        headers: reqHeaders,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const rawBuffer = Buffer.concat(chunks);
          const rawText = rawBuffer.toString("utf-8");
          let data = null;
          try {
            data = JSON.parse(rawText);
          } catch {
            data = rawText;
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data,
            rawBuffer,
          });
        });
      },
    );
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

async function run() {
  console.log("— login as admin —");
  let loginRes = await req("POST", "/api/auth/login", {
    email: "admin@fuego.tn",
    password: "admin12345",
  });
  let authCookie = null;
  let setCookie = loginRes.headers["set-cookie"];
  if (Array.isArray(setCookie)) {
    authCookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  }

  // Fallback try z@z.tn
  if (loginRes.status !== 200 || !authCookie) {
    const retry = await req("POST", "/api/auth/login", {
      email: "z@z.tn",
      password: "password1234",
    });
    setCookie = retry.headers["set-cookie"];
    if (Array.isArray(setCookie)) {
      authCookie = setCookie.map((c) => c.split(";")[0]).join("; ");
    }
  }

  if (!authCookie) {
    throw new Error(`Failed to login: ${JSON.stringify(loginRes.data)}`);
  }
  console.log("  ✓ authenticated admin session");

  const authHeaders = { cookie: authCookie };

  console.log("— finance stats & payments —");
  const statsRes = await req("GET", "/api/finance/stats", null, authHeaders);
  if (statsRes.status !== 200) {
    throw new Error(`Failed to get stats: ${JSON.stringify(statsRes.data)}`);
  }
  console.log("  ✓ live finance stats received:", {
    todayRevenue: statsRes.data.data.today.revenue,
    todayExpenses: statsRes.data.data.today.expenses,
    netProfit: statsRes.data.data.today.net_profit,
  });

  const paymentsRes = await req("GET", "/api/finance/payments", null, authHeaders);
  if (paymentsRes.status !== 200) {
    throw new Error(`Failed to get payments: ${JSON.stringify(paymentsRes.data)}`);
  }
  console.log(`  ✓ payments journal returned ${paymentsRes.data.data.length} receipts`);

  console.log("— expenses lifecycle —");
  const createExpRes = await req(
    "POST",
    "/api/expenses",
    {
      category: "materials",
      amount: 45000, // 45.000 DT
      note: "Test achat tissus",
      date: new Date().toISOString().split("T")[0],
    },
    authHeaders,
  );
  if (createExpRes.status !== 201) {
    throw new Error(`Failed to create expense: ${JSON.stringify(createExpRes.data)}`);
  }
  const expId = createExpRes.data.data.id;
  console.log("  ✓ expense created with ID:", expId);

  const listExpRes = await req("GET", "/api/expenses?category=materials", null, authHeaders);
  if (listExpRes.status !== 200 || listExpRes.data.data.length === 0) {
    throw new Error(`Failed to list expenses: ${JSON.stringify(listExpRes.data)}`);
  }
  console.log(`  ✓ expenses listed: total ${listExpRes.data.data.length} items`);

  const deleteExpRes = await req("DELETE", `/api/expenses/${expId}`, null, authHeaders);
  if (deleteExpRes.status !== 200) {
    throw new Error(`Failed to delete expense: ${JSON.stringify(deleteExpRes.data)}`);
  }
  console.log("  ✓ expense deleted successfully");

  console.log("— audit trail —");
  const auditRes = await req("GET", "/api/audit?limit=5", null, authHeaders);
  if (auditRes.status !== 200 || !auditRes.data.data) {
    throw new Error(`Failed to get audit logs: ${JSON.stringify(auditRes.data)}`);
  }
  console.log(`  ✓ audit trail returned ${auditRes.data.data.length} recent log entries`);

  console.log("— database backup & restore —");
  const backupRes = await req("GET", "/api/settings/backup", null, authHeaders);
  if (backupRes.status !== 200) {
    throw new Error(`Backup failed: ${backupRes.status}`);
  }
  const magic = backupRes.rawBuffer.subarray(0, 16).toString("utf-8");
  if (!magic.startsWith("SQLite format 3")) {
    throw new Error(`Invalid SQLite backup magic header: ${magic}`);
  }
  console.log(`  ✓ backup downloaded successfully (${backupRes.rawBuffer.length} bytes, valid SQLite 3 file)`);

  const base64Backup = backupRes.rawBuffer.toString("base64");
  const restoreRes = await req(
    "POST",
    "/api/settings/restore",
    { fileBase64: base64Backup },
    authHeaders,
  );
  if (restoreRes.status !== 201 && restoreRes.status !== 200) {
    throw new Error(`Restore failed: ${JSON.stringify(restoreRes.data)}`);
  }
  console.log("  ✓ database restored from backup snapshot successfully");

  console.log("\n✓ All Phase 2 & Phase 3 end-to-end checks passed!");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
