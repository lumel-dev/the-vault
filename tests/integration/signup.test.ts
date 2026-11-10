import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { db, limpiar, sesionComo, sinBase } from "./base";

const { signupAction } = await import("@/lib/actions/auth");
const { users } = await import("@/lib/db/schema");
const { eq } = await import("drizzle-orm");

function form(password: string, email = "nueva@example.com") {
  const f = new FormData();
  f.set("name", "Nueva");
  f.set("email", email);
  f.set("password", password);
  return f;
}

describe("registro", { skip: sinBase }, () => {
  beforeEach(async () => {
    await limpiar();
    sesionComo(null);
    process.env.SIGNUP_ENABLED = "true";
  });

  afterEach(() => {
    delete process.env.SIGNUP_ENABLED;
    delete process.env.TEST_ACCEPT_LANGUAGE;
  });

  it("acepta una contraseña de 8 caracteres", async () => {
    const res = await signupAction(undefined, form("12345678"));
    assert.equal(res, undefined);
    const [u] = await db.select({ locale: users.locale }).from(users).where(eq(users.email, "nueva@example.com"));
    assert.ok(u, "se creó la cuenta");
  });

  it("rechaza una de 7, con el mensaje en el idioma del navegador", async () => {
    assert.deepEqual(await signupAction(undefined, form("1234567")), { error: "La contraseña tiene que tener al menos 8 caracteres" });
    process.env.TEST_ACCEPT_LANGUAGE = "en-US";
    assert.deepEqual(await signupAction(undefined, form("1234567")), { error: "The password needs at least 8 characters" });
  });

  it("la cuenta nueva arranca en el idioma del navegador", async () => {
    process.env.TEST_ACCEPT_LANGUAGE = "en-US,en;q=0.9";
    await signupAction(undefined, form("12345678", "english@example.com"));
    const [u] = await db.select({ locale: users.locale }).from(users).where(eq(users.email, "english@example.com"));
    assert.equal(u.locale, "en");
  });
});
