// Industry sector + company role at onboarding: every combination, server-side
// rejection of invalid ones, the database constraint, and pre-sector orgs.
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { INDUSTRY_SECTORS, isValidSectorRole } from "@/lib/sectors";
import { buildContext } from "@/server/context";
import { getDb } from "@/server/db/client";
import { ORG_KINDS, memberships, organizations } from "@/server/db/schema";
import { createOrganization } from "@/server/domain/orgs";
import { expectDbError, freshDb, makeUser } from "../helpers";

beforeAll(async () => {
  await freshDb();
});

const pairs = INDUSTRY_SECTORS.flatMap((s) => ORG_KINDS.map((k) => [s, k] as const));

describe("sector and company role", () => {
  it.each(pairs.filter(([s, k]) => isValidSectorRole(s, k)))("%s + %s is saved with the organization", async (sector, kind) => {
    const u = await makeUser();
    const { org } = await createOrganization(u.id, { name: `${sector} ${kind}`, industrySector: sector, kind, hqState: "TX", hqZip: "75701" });
    const [row] = await getDb().select().from(organizations).where(eq(organizations.id, org.id));
    expect(row).toMatchObject({ industrySector: sector, kind, hqState: "TX", hqZip: "75701" });
  });

  it.each(pairs.filter(([s, k]) => !isValidSectorRole(s, k)))("%s + %s is rejected by the server", async (sector, kind) => {
    const u = await makeUser();
    await expect(createOrganization(u.id, { name: "Bad pair", industrySector: sector, kind })).rejects.toMatchObject({
      status: 422,
      message: "That company type isn't available for the selected industry sector",
    });
    const mine = await getDb().select().from(memberships).where(eq(memberships.userId, u.id));
    expect(mine).toHaveLength(0);
  });

  it("requires a sector and a role", async () => {
    const u = await makeUser();
    await expect(
      createOrganization(u.id, { name: "No sector", kind: "poster" } as never),
    ).rejects.toMatchObject({ status: 422, message: "Choose your industry sector" });
    await expect(
      createOrganization(u.id, { name: "No role", industrySector: "red_iron" } as never),
    ).rejects.toMatchObject({ status: 422, message: "Choose what your company does" });
    await expect(
      createOrganization(u.id, { name: "Bogus", industrySector: "aluminum", kind: "poster" } as never),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("the database rejects an invalid pair even if app code is bypassed", async () => {
    await expectDbError(
      getDb()
        .insert(organizations)
        .values({ name: "Direct", slug: `direct-${Date.now()}`, kind: "installer", industrySector: "tube_steel" }),
      /organizations_sector_role/,
    );
    // Changing an existing org's kind into an invalid pair is also blocked.
    const u = await makeUser();
    const { org } = await createOrganization(u.id, { name: "Sheds", industrySector: "portable_sheds", kind: "transporter" });
    await expectDbError(
      getDb().update(organizations).set({ kind: "installer" }).where(eq(organizations.id, org.id)),
      /organizations_sector_role/,
    );
  });

  it("organizations created before sectors existed keep working", async () => {
    const u = await makeUser();
    const [org] = await getDb()
      .insert(organizations)
      .values({ name: "Legacy Co", slug: `legacy-${Date.now()}`, kind: "installer", canProvide: true })
      .returning();
    await getDb().insert(memberships).values({ orgId: org.id, userId: u.id, role: "owner", isLeaderSeat: true });
    expect(org.industrySector).toBeNull();
    const ctx = await buildContext(u.id, org.id);
    expect(ctx.org?.id).toBe(org.id);
    await getDb().update(organizations).set({ name: "Legacy Co Renamed" }).where(eq(organizations.id, org.id));
  });
});
