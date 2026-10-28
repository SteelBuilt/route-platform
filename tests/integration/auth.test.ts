import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { getAuth } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { accounts, devOutbox, users } from "@/server/db/schema";
import { freshDb } from "../helpers";

beforeAll(async () => {
  process.env.PLATFORM_ADMIN_EMAILS = "admin@example.test";
  await freshDb();
});

describe("authentication", () => {
  it("signs up with email and password, hashes the password, sends a verification email", async () => {
    const res = await getAuth().api.signUpEmail({
      body: { email: "dealer@example.test", password: "correct horse battery", name: "Dana Dealer" },
    });
    expect(res.user.email).toBe("dealer@example.test");
    const [acct] = await getDb().select().from(accounts).where(eq(accounts.userId, res.user.id));
    expect(acct.password).toBeTruthy();
    expect(acct.password).not.toContain("correct horse");
    const mail = await getDb().select().from(devOutbox).where(eq(devOutbox.to, "dealer@example.test"));
    expect(mail.length).toBeGreaterThan(0);
  });

  it("signs in with the right password and rejects the wrong one", async () => {
    const ok = await getAuth().api.signInEmail({
      body: { email: "dealer@example.test", password: "correct horse battery" },
    });
    expect(ok.token).toBeTruthy();
    await expect(
      getAuth().api.signInEmail({ body: { email: "dealer@example.test", password: "wrong password!!" } }),
    ).rejects.toThrow();
  });

  it("rejects short passwords", async () => {
    await expect(
      getAuth().api.signUpEmail({ body: { email: "short@example.test", password: "short", name: "S" } }),
    ).rejects.toThrow();
  });

  it("marks configured emails as platform admins and nobody else", async () => {
    const admin = await getAuth().api.signUpEmail({
      body: { email: "admin@example.test", password: "admin password 123", name: "Admin" },
    });
    const [a] = await getDb().select().from(users).where(eq(users.id, admin.user.id));
    expect(a.platformRole).toBe("platform_admin");
    const [d] = await getDb().select().from(users).where(eq(users.email, "dealer@example.test"));
    expect(d.platformRole).toBe("none");
  });

  it("does not let sign-up set privileged fields", async () => {
    const res = await getAuth().api.signUpEmail({
      body: {
        email: "sneaky@example.test",
        password: "sneaky password 123",
        name: "Sneaky",
        // @ts-expect-error not an accepted input
        platformRole: "platform_admin",
      },
    });
    const [u] = await getDb().select().from(users).where(eq(users.id, res.user.id));
    expect(u.platformRole).toBe("none");
  });
});
