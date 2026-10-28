// Industry sectors and the company roles each allows (owner decision
// 2026-10-28). Shared by the onboarding form and the server, which enforces it.
// "Role" here is the organization's kind, not a user's membership role.

export const INDUSTRY_SECTORS = ["red_iron", "cold_formed_steel", "tube_steel", "portable_sheds"] as const;
export type IndustrySector = (typeof INDUSTRY_SECTORS)[number];

export type CompanyRole = "poster" | "installer" | "transporter" | "delivery_installer";

export const SECTOR_LABELS: Record<IndustrySector, string> = {
  red_iron: "Red Iron",
  cold_formed_steel: "Cold Formed Steel",
  tube_steel: "Tube Steel",
  portable_sheds: "Portable Sheds",
};

export const ROLE_TITLES: Record<CompanyRole, string> = {
  poster: "Manufacturer, supplier or dealer",
  installer: "Installation company or crew",
  transporter: "Delivery / transport company",
  delivery_installer: "Delivery and installation provider",
};

const DEFAULT_DESCRIPTIONS: Record<CompanyRole, string> = {
  poster: "You post delivery and installation work, and manage crews you already use.",
  installer: "You install or erect buildings.",
  transporter: "You haul and deliver buildings.",
  delivery_installer: "You deliver and install.",
};

// Roles available in each sector, in display order, with sector-specific wording.
export const SECTOR_ROLES: Record<IndustrySector, { role: CompanyRole; description: string }[]> = {
  red_iron: (["poster", "installer", "transporter", "delivery_installer"] as const).map((role) => ({
    role,
    description: DEFAULT_DESCRIPTIONS[role],
  })),
  cold_formed_steel: (["poster", "installer", "transporter", "delivery_installer"] as const).map((role) => ({
    role,
    description: DEFAULT_DESCRIPTIONS[role],
  })),
  tube_steel: [
    {
      role: "poster",
      description: "You sell or supply tube steel buildings and coordinate delivery or installation crews.",
    },
    { role: "delivery_installer", description: "You deliver and install tube steel buildings." },
  ],
  portable_sheds: [
    { role: "poster", description: "You manufacture, sell or supply portable sheds." },
    { role: "transporter", description: "You transport, deliver and place portable sheds." },
  ],
};

export function isIndustrySector(v: unknown): v is IndustrySector {
  return typeof v === "string" && (INDUSTRY_SECTORS as readonly string[]).includes(v);
}

export function isValidSectorRole(sector: IndustrySector, role: string): role is CompanyRole {
  return SECTOR_ROLES[sector].some((r) => r.role === role);
}
