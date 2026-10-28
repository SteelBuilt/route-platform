// All branding lives here, driven by environment variables, so the product can
// be rebranded or spun out without code changes. Components must import from
// this module rather than hard-coding names, colors or domains.

function read(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : fallback;
}

export const brand = {
  productName: read("NEXT_PUBLIC_BRAND_PRODUCT_NAME", "RouteYard by SBS"),
  shortName: read("NEXT_PUBLIC_BRAND_SHORT_NAME", "RouteYard"),
  legalEntity: read("NEXT_PUBLIC_BRAND_LEGAL_ENTITY", "SteelBuilt Systems LLC"),
  logoUrl: read("NEXT_PUBLIC_BRAND_LOGO_URL", ""),
  primaryColor: read("NEXT_PUBLIC_BRAND_PRIMARY_COLOR", "#1d4ed8"),
  supportEmail: read("NEXT_PUBLIC_BRAND_SUPPORT_EMAIL", "support@localhost"),
  domain: read("NEXT_PUBLIC_BRAND_DOMAIN", "localhost"),
} as const;

export type Brand = typeof brand;
