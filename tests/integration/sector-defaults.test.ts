// Primary sector is a default only: it preselects a category but never limits
// posting, discovery or applying. Matching uses profile building systems.
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { IndustrySector } from "@/lib/sectors";
import { buildContext } from "@/server/context";
import { getDb } from "@/server/db/client";
import { buildingCategories, organizations, memberships, type OrgKind } from "@/server/db/schema";
import { listCategories } from "@/server/domain/catalog";
import { searchRoutes } from "@/server/domain/discovery";
import { applyToRoute, getRouteForProvider, listApplicants } from "@/server/domain/marketplace";
import { createOrganization } from "@/server/domain/orgs";
import { saveProviderProfile } from "@/server/domain/profiles";
import { createDraft, publishRoute } from "@/server/domain/routes";
import { defaultCategoryId } from "@/server/domain/sector-defaults";
import { categoryId, loadTestCentroids, routeFixture } from "../fixtures";
import { freshDb, makeUser } from "../helpers";

async function org(sector: IndustrySector, kind: OrgKind) {
  const u = await makeUser();
  const { org } = await createOrganization(u.id, { name: `${sector} ${kind}`, industrySector: sector, kind });
  return buildContext(u.id, org.id);
}

beforeAll(async () => {
  await freshDb();
  await loadTestCentroids();
});

describe("Cold Formed Steel category", () => {
  it("exists under the Metal buildings umbrella with all job types", async () => {
    const ctx = await org("cold_formed_steel", "poster");
    const cats = await listCategories(ctx);
    const cfs = cats.find((c) => c.slug === "cold-formed-steel")!;
    const umbrella = cats.find((c) => c.slug === "metal-buildings")!;
    expect(cfs.parentId).toBe(umbrella.id);
    expect(cfs.allowedJobTypes).toEqual(["delivery", "installation", "delivery_installation"]);
  });
});

describe("primary sector as a default", () => {
  it.each([
    ["red_iron", "red-iron"],
    ["cold_formed_steel", "cold-formed-steel"],
    ["tube_steel", "tube-steel"],
    ["portable_sheds", "portable-buildings"],
  ] as const)("%s preselects %s", async (sector, slug) => {
    const ctx = await org(sector, "poster");
    expect(await defaultCategoryId(ctx)).toBe(await categoryId(slug));
  });

  it("orgs without a primary sector get no default", async () => {
    const u = await makeUser();
    const [o] = await getDb()
      .insert(organizations)
      .values({ name: "Legacy", slug: `legacy-${Date.now()}`, kind: "poster", canPost: true })
      .returning();
    await getDb().insert(memberships).values({ orgId: o.id, userId: u.id, role: "owner", isLeaderSeat: true });
    expect(await defaultCategoryId(await buildContext(u.id, o.id))).toBeNull();
  });

  it("doesn't restrict posting, discovery or applying", async () => {
    const shedPoster = await org("portable_sheds", "poster");
    const redIron = await createDraft(shedPoster, await routeFixture({ title: "Red iron from a shed dealer" }));
    await expect(publishRoute(shedPoster, redIron)).resolves.toBeUndefined();

    const tubeCrew = await org("tube_steel", "installer");
    const found = await searchRoutes(tubeCrew, {});
    expect(found.results.map((r) => r.id)).toContain(redIron);
    await expect(applyToRoute(tubeCrew, redIron, {})).resolves.toBeTruthy();
  });
});

describe("matching uses profile building systems", () => {
  it("filters discovery, flags the provider view and the applicant comparison", async () => {
    const poster = await org("red_iron", "poster");
    const red = await createDraft(poster, await routeFixture({ title: "Red iron job" }));
    await publishRoute(poster, red);
    const cfs = await createDraft(
      poster,
      await routeFixture({ title: "Cold formed job", buildingCategoryId: await categoryId("cold-formed-steel") }),
    );
    await publishRoute(poster, cfs);

    // Primary sector Portable Sheds, but the profile lists cold formed steel.
    const crew = await org("portable_sheds", "transporter");
    const noProfile = await searchRoutes(crew, { mySystems: true });
    expect(noProfile.systemsNote).toMatch(/doesn't list any building systems/);

    await saveProviderProfile(crew, { buildingCategoryIds: [await categoryId("cold-formed-steel")], jobTypes: ["delivery"] });
    const mine = await searchRoutes(crew, { mySystems: true });
    const ids = mine.results.map((r) => r.id);
    expect(ids).toContain(cfs);
    expect(ids).not.toContain(red);
    const all = await searchRoutes(crew, {});
    expect(all.results.find((r) => r.id === red)!.inMySystems).toBe(false);
    expect(all.results.find((r) => r.id === cfs)!.inMySystems).toBe(true);

    expect((await getRouteForProvider(crew, red)).inMySystems).toBe(false);
    await applyToRoute(crew, red, {});
    await applyToRoute(crew, cfs, {});
    const [redApp] = await listApplicants(poster, red);
    const [cfsApp] = await listApplicants(poster, cfs);
    expect(redApp.listsThisSystem).toBe(false);
    expect(cfsApp.listsThisSystem).toBe(true);
    expect(cfsApp.systems).toEqual(["Cold formed steel buildings"]);
  });

  it("tube steel now allows installation crews (DB constraint updated)", async () => {
    const ctx = await org("tube_steel", "installer");
    const [o] = await getDb().select().from(organizations).where(eq(organizations.id, ctx.orgId!));
    expect(o).toMatchObject({ industrySector: "tube_steel", kind: "installer" });
    const [c] = await getDb().select().from(buildingCategories).where(eq(buildingCategories.slug, "tube-steel"));
    expect(c).toBeTruthy();
  });
});
