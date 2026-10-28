import { describe, expect, it } from "vitest";
import { SECTOR_DEFAULT_CATEGORY, SECTOR_LABELS, SECTOR_ROLES, isValidSectorRole } from "@/lib/sectors";

describe("industry sectors", () => {
  it("offers exactly the owner-specified roles per sector", () => {
    const roles = Object.fromEntries(Object.entries(SECTOR_ROLES).map(([s, r]) => [s, r.map((x) => x.role)]));
    expect(roles).toEqual({
      red_iron: ["poster", "installer", "transporter", "delivery_installer"],
      cold_formed_steel: ["poster", "installer", "transporter", "delivery_installer"],
      tube_steel: ["poster", "installer", "delivery_installer"],
      portable_sheds: ["poster", "transporter"],
    });
    expect(Object.values(SECTOR_LABELS)).toEqual(["Red Iron", "Cold Formed Steel", "Tube Steel", "Portable Sheds"]);
  });

  it("uses sector-specific wording for tube steel and portable sheds", () => {
    const d = (s: keyof typeof SECTOR_ROLES, r: string) => SECTOR_ROLES[s].find((x) => x.role === r)!.description;
    expect(d("tube_steel", "poster")).toBe(
      "You sell or supply tube steel buildings and coordinate delivery or installation crews.",
    );
    expect(d("tube_steel", "delivery_installer")).toBe("You deliver and install tube steel buildings.");
    expect(d("portable_sheds", "poster")).toBe("You manufacture, sell or supply portable sheds.");
    expect(d("portable_sheds", "transporter")).toBe("You transport, deliver and place portable sheds.");
    expect(d("red_iron", "installer")).toBe("You install or erect buildings.");
    const tubeInstaller = SECTOR_ROLES.tube_steel.find((x) => x.role === "installer")!;
    expect(tubeInstaller.title).toBe("Installation company or independent crew");
  });

  it("maps each primary sector to a default building category", () => {
    expect(SECTOR_DEFAULT_CATEGORY).toEqual({
      red_iron: "red-iron",
      cold_formed_steel: "cold-formed-steel",
      tube_steel: "tube-steel",
      portable_sheds: "portable-buildings",
    });
  });

  it("validates pairs", () => {
    expect(isValidSectorRole("tube_steel", "installer")).toBe(true);
    expect(isValidSectorRole("tube_steel", "transporter")).toBe(false);
    expect(isValidSectorRole("portable_sheds", "delivery_installer")).toBe(false);
    expect(isValidSectorRole("cold_formed_steel", "transporter")).toBe(true);
  });
});
