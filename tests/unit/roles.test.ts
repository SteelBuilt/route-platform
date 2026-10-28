import { describe, expect, it } from "vitest";
import { canAssignRole, capabilitiesFor } from "@/server/authz/roles";

describe("role capabilities", () => {
  it("free crew members and staff see only their assigned work by default", () => {
    for (const role of ["crew_member", "staff"] as const) {
      const caps = capabilitiesFor(role);
      expect(caps.size).toBe(0);
    }
  });

  it("crew leaders can browse and apply but not accept awards or manage the org", () => {
    const caps = capabilitiesFor("crew_leader");
    expect(caps.has("marketplace.browse")).toBe(true);
    expect(caps.has("applications.submit")).toBe(true);
    expect(caps.has("awards.accept")).toBe(false);
    expect(caps.has("org.manage")).toBe(false);
  });

  it("only owners manage billing", () => {
    expect(capabilitiesFor("owner").has("org.billing")).toBe(true);
    expect(capabilitiesFor("dispatcher").has("org.billing")).toBe(false);
  });

  it("overrides don't widen leader roles beyond their base", () => {
    expect(capabilitiesFor("crew_leader", { post_routes: true }).has("routes.post")).toBe(false);
    expect(capabilitiesFor("staff", { post_routes: true }).has("routes.post")).toBe(true);
  });

  it("role assignment rules", () => {
    expect(canAssignRole("owner", "owner")).toBe(true);
    expect(canAssignRole("dispatcher", "owner")).toBe(false);
    expect(canAssignRole("dispatcher", "crew_member")).toBe(true);
    expect(canAssignRole("crew_leader", "crew_member")).toBe(false);
  });
});
