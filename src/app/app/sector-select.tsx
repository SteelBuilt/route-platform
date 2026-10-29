import { Field, Select } from "@/components/ui";
import { SECTOR_LABELS, sectorsForRole, type CompanyRole, type IndustrySector } from "@/lib/sectors";

// Primary sector picker limited to the sectors valid for the org's company type.
export function SectorSelect({ kind, value }: { kind: CompanyRole; value: IndustrySector | null }) {
  return (
    <Field label="Primary sector" hint="Sets your default building type for new routes and search. It never limits what you can post or apply to.">
      <Select name="primarySector" defaultValue={value ?? ""} required>
        <option value="" disabled>
          Choose…
        </option>
        {sectorsForRole(kind).map((s) => (
          <option key={s} value={s}>
            {SECTOR_LABELS[s]}
          </option>
        ))}
      </Select>
    </Field>
  );
}
