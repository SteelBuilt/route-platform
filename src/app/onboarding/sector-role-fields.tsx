"use client";

// Primary sector first, then only the company roles that sector allows.
// Changing the sector clears the role so an invalid pair can't be submitted;
// the server re-checks the pair (orgs.ts) and so does the database.
import { useState } from "react";
import { INDUSTRY_SECTORS, SECTOR_LABELS, SECTOR_ROLES, ROLE_TITLES, type CompanyRole, type IndustrySector } from "@/lib/sectors";

export function SectorRoleFields({ audience }: { audience: "poster" | "provider" | null }) {
  const [sector, setSector] = useState<IndustrySector | "">("");
  const [role, setRole] = useState<CompanyRole | "">("");

  const roles = sector
    ? SECTOR_ROLES[sector].filter((r) => (audience === "provider" ? r.role !== "poster" : true))
    : [];

  function chooseSector(next: IndustrySector) {
    setSector(next);
    // Keep nothing from the previous sector; preselect only the obvious case.
    setRole(audience === "poster" ? "poster" : "");
  }

  return (
    <>
      <fieldset>
        <legend className="mb-1 font-semibold">Primary sector</legend>
        <p className="-mt-1 mb-2 text-sm text-muted">
          Sets your default building type for routes and search. You can still post or apply to any type.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {INDUSTRY_SECTORS.map((s) => (
            <label
              key={s}
              className="flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border-2 border-line px-3 py-2 font-medium has-[:checked]:border-brand has-[:checked]:bg-surface"
            >
              <input
                type="radio"
                name="industrySector"
                value={s}
                required
                checked={sector === s}
                onChange={() => chooseSector(s)}
                className="h-5 w-5 shrink-0 accent-[var(--brand)]"
              />
              {SECTOR_LABELS[s]}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2" aria-describedby={sector ? undefined : "role-hint"}>
        <legend className="mb-1 font-semibold">What does your company do?</legend>
        {!sector ? (
          <p id="role-hint" className="rounded-lg border-2 border-dashed border-line p-3 text-muted">
            Choose your primary sector first.
          </p>
        ) : roles.length === 0 ? (
          <p className="rounded-lg border-2 border-dashed border-line p-3 text-muted">
            No provider company types are available for {SECTOR_LABELS[sector]}. Choose another sector.
          </p>
        ) : (
          roles.map((r) => (
            <label
              key={r.role}
              className="flex min-h-14 cursor-pointer gap-3 rounded-lg border-2 border-line p-3 has-[:checked]:border-brand has-[:checked]:bg-surface"
            >
              <input
                type="radio"
                name="kind"
                value={r.role}
                required
                checked={role === r.role}
                onChange={() => setRole(r.role)}
                className="mt-1 h-5 w-5 shrink-0 accent-[var(--brand)]"
              />
              <span>
                <span className="block font-semibold">{r.title ?? ROLE_TITLES[r.role]}</span>
                <span className="block text-sm text-muted">{r.description}</span>
              </span>
            </label>
          ))
        )}
      </fieldset>
    </>
  );
}
