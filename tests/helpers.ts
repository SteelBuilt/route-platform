// Test harness: a fresh in-memory PGlite database per test file, migrated and
// loaded with reference data, plus factories for users and orgs.
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { getDb, makePgliteHolder, setDbForTests } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";
import { seedBase } from "@/server/db/seed-base";
import { memberships, users, type OrgKind, type Role } from "@/server/db/schema";
import { buildContext, type RequestContext } from "@/server/context";
import { createOrganization } from "@/server/domain/orgs";
import { resetAuthForTests } from "@/server/auth";

export async function freshDb() {
  const pglite = new PGlite();
  setDbForTests(makePgliteHolder(pglite));
  resetAuthForTests();
  await runMigrations();
  await seedBase(getDb());
  return pglite;
}

let n = 0;
export async function makeUser(opts: { email?: string; name?: string; platformAdmin?: boolean } = {}) {
  n += 1;
  const id = randomUUID();
  const email = (opts.email ?? `user${n}-${id.slice(0, 6)}@example.test`).toLowerCase();
  await getDb()
    .insert(users)
    .values({
      id,
      name: opts.name ?? `User ${n}`,
      email,
      emailVerified: true,
      platformRole: opts.platformAdmin ? "platform_admin" : "none",
    });
  return { id, email };
}

export async function makeOrg(kind: OrgKind, name = `${kind} org ${++n}`) {
  const owner = await makeUser();
  const { org } = await createOrganization(owner.id, { industrySector: "red_iron", name, kind });
  return { org, owner, ctx: await buildContext(owner.id, org.id) };
}

// Adds a member directly (bypassing invitations) for authorization tests.
export async function addMember(orgId: string, role: Role): Promise<RequestContext> {
  const u = await makeUser();
  await getDb()
    .insert(memberships)
    .values({ orgId, userId: u.id, role, isLeaderSeat: ["owner", "dispatcher", "crew_leader"].includes(role) });
  return buildContext(u.id, orgId);
}

export async function ctxFor(userId: string, orgId?: string) {
  return buildContext(userId, orgId);
}

// Drizzle wraps driver errors ("Failed query: ..."); the Postgres reason is on `cause`.
export async function expectDbError(p: Promise<unknown>, pattern: RegExp) {
  let err: unknown;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  if (!err) throw new Error(`Expected a database error matching ${pattern}, but the query succeeded`);
  const e = err as { message?: string; cause?: { message?: string } };
  const text = `${e.message ?? ""} ${e.cause?.message ?? ""}`;
  if (!pattern.test(text)) throw new Error(`Expected database error matching ${pattern}, got: ${text}`);
}

export async function setUserEmail(userId: string, email: string) {
  await getDb().update(users).set({ email }).where(eq(users.id, userId));
}
