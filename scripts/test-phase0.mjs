/**
 * Phase 0 API smoke test — exercises the full auth + users flow against a
 * running standalone backend (http://127.0.0.1:3220). Exits non-zero on the
 * first failed assertion.
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
    // Keep both session + refresh cookies.
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
  console.log("— setup gate —");
  let r = await call("GET", "/setup/status", null, false);
  check("needs_setup=false after wizard", r.json.data?.needs_setup === false);

  r = await call("POST", "/setup", { business_name: "Xy", full_name: "Yz", email: "z@z.tn", password: "123456789" }, false);
  check("second setup refused", r.status === 403, JSON.stringify(r.json));

  console.log("— auth —");
  r = await call("POST", "/auth/login", { email: "admin@fuego.tn", password: "WRONG" }, false);
  check("wrong password → 401", r.status === 401);
  check("failed login has message", r.json.error?.message === "Identifiants invalides");

  r = await call("POST", "/auth/login", { email: "ADMIN@fuego.tn", password: "admin12345" }, false);
  check("login (case-insensitive email)", r.status === 200, JSON.stringify(r.json));
  check("cookies set", /fuego_session/.test(cookie) && /fuego_refresh/.test(cookie));

  r = await call("GET", "/auth/me");
  check("me returns identity", r.json.data?.email === "admin@fuego.tn");
  check("me hides hash", !("password_hash" in (r.json.data ?? {})));

  console.log("— users —");
  r = await call("GET", "/users?page=1&limit=10");
  check("users list paginated", r.json.data?.length === 1 && r.json.meta?.total === 1);

  // staff creation needs no admin password
  r = await call("POST", "/users", {
    full_name: "Salma Trabelsi", email: "salma@fuego.tn", password: "staff12345", role: "staff",
  });
  check("staff created", r.status === 201 && r.json.data?.role === "staff", JSON.stringify(r.json));
  const staffId = r.json.data?.id;

  // duplicate email refused
  r = await call("POST", "/users", {
    full_name: "Salma 2", email: "SALMA@fuego.tn", password: "staff12345", role: "staff",
  });
  check("duplicate email → 409", r.status === 409);

  // creating a second admin without actor password refused
  r = await call("POST", "/users", {
    full_name: "Second Admin", email: "admin2@fuego.tn", password: "admin22345", role: "super_admin",
  });
  check("admin without own password → 403", r.status === 403, JSON.stringify(r.json));

  r = await call("POST", "/users", {
    full_name: "Second Admin", email: "admin2@fuego.tn", password: "admin22345", role: "super_admin",
    admin_password: "WRONG",
  });
  check("admin with wrong own password → 403", r.status === 403);

  r = await call("POST", "/users", {
    full_name: "Second Admin", email: "admin2@fuego.tn", password: "admin22345", role: "super_admin",
    admin_password: "admin12345",
  });
  check("admin with own password → 201", r.status === 201, JSON.stringify(r.json));
  const admin2Id = r.json.data?.id;

  // self-protection
  r = await call("GET", "/auth/me");
  const meId = r.json.data?.id;
  r = await call("PATCH", `/users/${meId}`, { role: "staff" });
  check("cannot demote self", r.status === 403);
  r = await call("PATCH", `/users/${meId}`, { is_active: false });
  check("cannot deactivate self", r.status === 403);

  // last-admin guard: demote admin2 to staff, then try deactivating me → still 403 (self rule fires first)
  r = await call("PATCH", `/users/${admin2Id}`, { role: "staff" });
  check("demote other admin ok", r.status === 200);

  // deactivate staff
  r = await call("PATCH", `/users/${staffId}`, { is_active: false });
  check("deactivate staff ok", r.status === 200 && r.json.data?.is_active === false);

  // reset password
  r = await call("POST", `/users/${staffId}/reset-password`, { new_password: "newpass12345" });
  check("reset password ok", r.status === 200);

  // deactivated staff cannot log in
  r = await call("POST", "/auth/login", { email: "salma@fuego.tn", password: "newpass12345" }, false);
  check("deactivated login → 401 with account message", r.status === 401 && /désactivé/.test(r.json.error?.message ?? ""));

  console.log("— roles guard —");
  // staff-actor checks: log in as reactivated staff (re-activate first)
  r = await call("PATCH", `/users/${staffId}`, { is_active: true });
  check("reactivate staff", r.status === 200);
  r = await call("POST", "/auth/login", { email: "salma@fuego.tn", password: "newpass12345" }, false);
  check("staff login ok", r.status === 200);
  r = await call("GET", "/users");
  check("staff cannot list users", r.status === 403);
  r = await call("GET", "/auth/me");
  check("staff me ok", r.status === 200);

  console.log("— change password + session eviction —");
  r = await call("POST", "/auth/change-password", { current_password: "newpass12345", new_password: "changed12345" });
  check("staff changes own password", r.status === 200);
  r = await call("GET", "/auth/me");
  check("old session evicted after change", r.status === 401);

  console.log("— refresh —");
  cookie = "";
  r = await call("POST", "/auth/login", { email: "admin@fuego.tn", password: "admin12345" }, false);
  check("admin re-login", r.status === 200);
  r = await call("POST", "/auth/refresh");
  check("refresh rotates cookies", r.status === 200 && /fuego_session/.test(cookie));
  r = await call("GET", "/auth/me");
  check("me after refresh", r.status === 200);

  console.log("— api key guard —");
  const noKey = await fetch(BASE + "/auth/me", { headers: { cookie } });
  check("missing api key → 401", noKey.status === 401);

  console.log("— audit —");
  cookie = "";
  await call("POST", "/auth/login", { email: "admin@fuego.tn", password: "admin12345" }, false);
  r = await call("GET", "/audit?limit=100");
  const actions = (r.json.data ?? []).map((a) => a.action);
  check("audit has login entries", actions.includes("auth.login_success"), JSON.stringify(actions.slice(0, 5)));
  check("audit has user.created", actions.includes("user.created"));
  check("audit has setup.completed", actions.includes("setup.completed"));

  console.log("— logout —");
  r = await call("POST", "/auth/logout");
  check("logout ok", r.status === 200);
  r = await call("GET", "/auth/me");
  check("me after logout → 401", r.status === 401);

  console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Test crashed:", err);
  process.exit(1);
});
