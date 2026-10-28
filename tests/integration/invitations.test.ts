import { and, desc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/server/db/client";
import { auditLogs, devOutbox, invitations, memberships } from "@/server/db/schema";
import {
  acceptInvitation,
  createInvitation,
  hashToken,
  listPendingInvitations,
  previewInvitation,
  revokeInvitation,
} from "@/server/domain/invitations";
import { addMember, freshDb, makeOrg, makeUser } from "../helpers";

let A: Awaited<ReturnType<typeof makeOrg>>;

beforeAll(async () => {
  await freshDb();
  A = await makeOrg("installer", "Lone Star Erectors");
});

describe("invitations", () => {
  it("emails a single-use link, stores only a hash, and grants the invited role", async () => {
    const invitee = await makeUser({ email: "crew.one@example.test" });
    const { token, id } = await createInvitation(A.ctx, { email: "Crew.One@example.test", role: "crew_member" });

    const [row] = await getDb().select().from(invitations).where(eq(invitations.id, id));
    expect(row.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(row)).not.toContain(token);

    const [mail] = await getDb().select().from(devOutbox).where(eq(devOutbox.to, "crew.one@example.test"));
    expect(mail.text).toContain(`/invite/${token}`);

    expect(await previewInvitation(token)).toMatchObject({ state: "valid", orgName: "Lone Star Erectors" });

    const res = await acceptInvitation(invitee.id, token);
    expect(res.role).toBe("crew_member");
    const [m] = await getDb()
      .select()
      .from(memberships)
      .where(and(eq(memberships.orgId, A.org.id), eq(memberships.userId, invitee.id)));
    expect(m).toMatchObject({ role: "crew_member", isLeaderSeat: false, status: "active" });

    await expect(acceptInvitation(invitee.id, token)).rejects.toThrow(/invalid, expired, or already used/);
    expect((await previewInvitation(token)).state).toBe("used");

    const actions = (await getDb().select().from(auditLogs).orderBy(desc(auditLogs.occurredAt))).map((a) => a.action);
    expect(actions).toContain("invitation.create");
    expect(actions).toContain("invitation.accept");
  });

  it("rejects a different signed-in email", async () => {
    const other = await makeUser({ email: "someone.else@example.test" });
    const { token } = await createInvitation(A.ctx, { email: "intended@example.test", role: "crew_leader" });
    await expect(acceptInvitation(other.id, token)).rejects.toThrow(/different email/);
  });

  it("rejects expired invitations", async () => {
    const u = await makeUser({ email: "late@example.test" });
    const created = new Date("2026-01-01T00:00:00Z");
    const { token } = await createInvitation(A.ctx, { email: "late@example.test", role: "staff" }, created);
    const eightDaysLater = new Date(created.getTime() + 8 * 86_400_000);
    expect((await previewInvitation(token, eightDaysLater)).state).toBe("expired");
    await expect(acceptInvitation(u.id, token, { now: eightDaysLater })).rejects.toThrow(/expired/);
  });

  it("rejects revoked invitations and removes them from the pending list", async () => {
    const u = await makeUser({ email: "revoked@example.test" });
    const { token, id } = await createInvitation(A.ctx, { email: "revoked@example.test", role: "staff" });
    expect((await listPendingInvitations(A.ctx)).some((i) => i.id === id)).toBe(true);
    await revokeInvitation(A.ctx, id);
    expect((await listPendingInvitations(A.ctx)).some((i) => i.id === id)).toBe(false);
    await expect(acceptInvitation(u.id, token)).rejects.toThrow();
  });

  it("rejects garbage tokens without revealing anything", async () => {
    const u = await makeUser();
    expect((await previewInvitation("not-a-real-token")).state).toBe("invalid");
    await expect(acceptInvitation(u.id, "not-a-real-token")).rejects.toThrow();
  });

  it("only owners and dispatchers can invite; dispatchers can't create owners", async () => {
    const leader = await addMember(A.org.id, "crew_leader");
    const member = await addMember(A.org.id, "crew_member");
    const dispatcher = await addMember(A.org.id, "dispatcher");
    await expect(createInvitation(leader, { email: "x@example.test", role: "crew_member" })).rejects.toThrow(
      /permission/,
    );
    await expect(createInvitation(member, { email: "x@example.test", role: "crew_member" })).rejects.toThrow(
      /permission/,
    );
    await expect(createInvitation(dispatcher, { email: "x@example.test", role: "owner" })).rejects.toThrow(
      /that role/,
    );
    await expect(createInvitation(dispatcher, { email: "x@example.test", role: "crew_leader" })).resolves.toBeTruthy();
  });

  it("can't revoke another org's invitation (404)", async () => {
    const B = await makeOrg("poster");
    const { id } = await createInvitation(B.ctx, { email: "b.invitee@example.test", role: "staff" });
    await expect(revokeInvitation(A.ctx, id)).rejects.toMatchObject({ status: 404 });
  });

  it("rate-limits invitation creation per org", async () => {
    const C = await makeOrg("poster");
    const sendMany = async () => {
      for (let i = 0; i < 31; i++) {
        await createInvitation(C.ctx, { email: `bulk${i}@example.test`, role: "staff" });
      }
    };
    await expect(sendMany()).rejects.toMatchObject({ status: 429 });
  });
});
