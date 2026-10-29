import { ActionForm } from "@/components/action-form";
import type { CompanyRole } from "@/lib/sectors";
import { dismissSectorPromptAction, setPrimarySectorAction } from "./actions";
import { SectorSelect } from "./sector-select";

// One-time prompt for organizations created before primary sectors existed.
// Shown to owners/dispatchers until they set a sector or choose "Not now".
export function SectorPrompt({ kind }: { kind: CompanyRole }) {
  return (
    <section aria-label="Set your primary sector" className="rounded-xl border-2 border-brand bg-surface p-4">
      <p className="font-semibold">Set your primary sector</p>
      <p className="mt-1 text-sm text-muted">One quick question so new routes and search start on the right building type.</p>
      <ActionForm action={setPrimarySectorAction} submitLabel="Save" className="mt-3 space-y-3">
        <SectorSelect kind={kind} value={null} />
      </ActionForm>
      <ActionForm action={dismissSectorPromptAction} submitLabel="Not now" variant="secondary" className="mt-2" />
    </section>
  );
}
