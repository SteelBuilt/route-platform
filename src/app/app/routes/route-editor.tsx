"use client";

// Route editor: one form for create and edit, with ordered stops that can be
// added, removed and reordered. Serializes to JSON for the server action,
// which validates everything again.
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { US_TIMEZONES } from "@/lib/time";
import type { ActionState } from "@/server/session";

type Category = { id: string; name: string; isUmbrella: boolean; parentId: string | null; allowedJobTypes: string[]; defaultJobType: string };
type Option = { id: string; name: string };

type Address = { line1: string; line2?: string | null; city: string; state: string; zip: string };
export type StopState = {
  address: Address;
  timezone: string;
  deliveryWindowStart?: string | null;
  deliveryWindowEnd?: string | null;
  installWindowStart?: string | null;
  installWindowEnd?: string | null;
  appointmentWindowStart?: string | null;
  appointmentWindowEnd?: string | null;
  customerAvailabilityNotes?: string | null;
  buildingWidthFt?: number | string | null;
  buildingLengthFt?: number | string | null;
  buildingHeightFt?: number | string | null;
  buildingSystem?: string | null;
  manufacturerName?: string | null;
  openings?: string | null;
  otherDetails?: string | null;
  loadLengthFt?: number | string | null;
  loadWidthFt?: number | string | null;
  loadHeightFt?: number | string | null;
  loadWeightLbs?: number | string | null;
  pieceCount?: number | string | null;
  siteAccessNotes?: string | null;
  unloadingConstraints?: string | null;
  surface?: string | null;
  surfaceNotes?: string | null;
  siteReadiness?: string;
  plansStatus?: string;
  permitStatus?: string;
  engineeringStatus?: string;
  safetyNotes?: string | null;
  accessInstructions?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  equipmentTypeIds?: string[];
};
export type RouteState = {
  title: string;
  buildingCategoryId: string;
  jobType: string;
  visibility: string;
  invitedProviderOrgIds: string[];
  pickup: Address | null;
  pickupTimezone: string;
  pickupWindowStart?: string | null;
  pickupWindowEnd?: string | null;
  estimatedDurationMinutes?: number | string | null;
  crewSizeRequired?: number | string | null;
  loadingResponsibility?: string | null;
  unloadingResponsibility?: string | null;
  responsibilityNotes?: string | null;
  compensationMode: string;
  compensationBasis: string;
  compensationUnitLabel?: string | null;
  compensationCents?: number | string | null;
  providerNotes?: string | null;
  assignmentNotes?: string | null;
  internalNotes?: string | null;
  applicationDeadline?: string | null;
  expiresAt?: string | null;
  equipmentTypeIds: string[];
  qualificationTypeIds: string[];
  stops: StopState[];
};

const JOB_LABEL: Record<string, string> = {
  delivery: "Delivery only",
  installation: "Installation / erection only",
  delivery_installation: "Delivery and installation",
};

const emptyAddress = (): Address => ({ line1: "", line2: "", city: "", state: "TX", zip: "" });
const emptyStop = (tz: string): StopState => ({
  address: emptyAddress(),
  timezone: tz,
  siteReadiness: "unknown",
  plansStatus: "unknown",
  permitStatus: "unknown",
  engineeringStatus: "unknown",
  equipmentTypeIds: [],
});

export function emptyRoute(defaultCategory?: Category): RouteState {
  return {
    title: "",
    buildingCategoryId: defaultCategory?.id ?? "",
    jobType: defaultCategory?.defaultJobType ?? "delivery",
    visibility: "marketplace",
    invitedProviderOrgIds: [],
    pickup: emptyAddress(),
    pickupTimezone: "America/Chicago",
    compensationMode: "fixed",
    compensationBasis: "route_total",
    equipmentTypeIds: [],
    qualificationTypeIds: [],
    stops: [emptyStop("America/Chicago")],
  };
}

function Section({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <fieldset className="space-y-4 rounded-xl border-2 border-line bg-white p-4 sm:p-6">
      <legend className="px-1 text-lg font-bold">{title}</legend>
      {hint && <p className="-mt-2 text-sm text-muted">{hint}</p>}
      {children}
    </fieldset>
  );
}

function Textarea(props: React.ComponentProps<"textarea">) {
  return (
    <textarea
      {...props}
      rows={props.rows ?? 3}
      className="block w-full rounded-lg border-2 border-line bg-white px-3 py-2 text-base focus:border-brand"
    />
  );
}

function Checklist({ options, value, onChange }: { options: Option[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="grid gap-1 sm:grid-cols-2">
      {options.map((o) => (
        <label key={o.id} className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            className="h-5 w-5 accent-[var(--brand)]"
            checked={value.includes(o.id)}
            onChange={(e) => onChange(e.target.checked ? [...value, o.id] : value.filter((x) => x !== o.id))}
          />
          {o.name}
        </label>
      ))}
    </div>
  );
}

function AddressFields({ value, onChange, idPrefix }: { value: Address; onChange: (a: Address) => void; idPrefix: string }) {
  const set = (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid gap-3 sm:grid-cols-6">
      <div className="sm:col-span-4">
        <Field label="Street address">
          <Input id={`${idPrefix}-line1`} value={value.line1} onChange={set("line1")} autoComplete="off" />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Suite / lot (optional)">
          <Input value={value.line2 ?? ""} onChange={set("line2")} autoComplete="off" />
        </Field>
      </div>
      <div className="sm:col-span-3">
        <Field label="City">
          <Input value={value.city} onChange={set("city")} autoComplete="off" />
        </Field>
      </div>
      <div className="sm:col-span-1">
        <Field label="State">
          <Input value={value.state} onChange={set("state")} maxLength={2} className="uppercase" />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="ZIP">
          <Input value={value.zip} onChange={set("zip")} inputMode="numeric" maxLength={5} />
        </Field>
      </div>
    </div>
  );
}

function Window({
  label,
  start,
  end,
  onChange,
}: {
  label: string;
  start?: string | null;
  end?: string | null;
  onChange: (s: string | null, e: string | null) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={`${label}: from`}>
        <Input type="datetime-local" value={start ?? ""} onChange={(e) => onChange(e.target.value || null, end ?? null)} />
      </Field>
      <Field label={`${label}: to`}>
        <Input type="datetime-local" value={end ?? ""} onChange={(e) => onChange(start ?? null, e.target.value || null)} />
      </Field>
    </div>
  );
}

function TzSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="Time zone">
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {US_TIMEZONES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

const DOC_STATUS = [
  ["unknown", "Unknown"],
  ["not_required", "Not required"],
  ["pending", "Pending"],
  ["provided", "Provided"],
] as const;

function StopEditor({
  stop,
  index,
  count,
  jobType,
  equipment,
  onChange,
  onMove,
  onRemove,
}: {
  stop: StopState;
  index: number;
  count: number;
  jobType: string;
  equipment: Option[];
  onChange: (s: StopState) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const set = <K extends keyof StopState>(k: K, v: StopState[K]) => onChange({ ...stop, [k]: v });
  const txt = (k: keyof StopState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    set(k, e.target.value as never);
  const delivery = jobType !== "installation";
  const install = jobType !== "delivery";
  return (
    <div className="space-y-4 rounded-xl border-2 border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold">Stop {index + 1}</h3>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Move stop ${index + 1} up`}>
            ↑
          </Button>
          <Button type="button" variant="secondary" onClick={() => onMove(1)} disabled={index === count - 1} aria-label={`Move stop ${index + 1} down`}>
            ↓
          </Button>
          <Button type="button" variant="danger" onClick={onRemove} disabled={count === 1}>
            Remove
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted">
        Before award, providers see only the ZIP code. The street address and contact are released after they accept.
      </p>
      <AddressFields value={stop.address} onChange={(a) => set("address", a)} idPrefix={`stop-${index}`} />
      <TzSelect value={stop.timezone} onChange={(v) => set("timezone", v)} />
      {delivery && (
        <Window
          label="Delivery window"
          start={stop.deliveryWindowStart}
          end={stop.deliveryWindowEnd}
          onChange={(s, e) => onChange({ ...stop, deliveryWindowStart: s, deliveryWindowEnd: e })}
        />
      )}
      {install && (
        <Window
          label="Installation window"
          start={stop.installWindowStart}
          end={stop.installWindowEnd}
          onChange={(s, e) => onChange({ ...stop, installWindowStart: s, installWindowEnd: e })}
        />
      )}

      <details className="rounded-lg border-2 border-line">
        <summary className="min-h-12 cursor-pointer px-3 py-3 font-semibold">Building and load details</summary>
        <div className="space-y-3 border-t-2 border-line p-3">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Width (ft)">
              <Input type="number" min={0} step="any" value={stop.buildingWidthFt ?? ""} onChange={txt("buildingWidthFt")} />
            </Field>
            <Field label="Length (ft)">
              <Input type="number" min={0} step="any" value={stop.buildingLengthFt ?? ""} onChange={txt("buildingLengthFt")} />
            </Field>
            <Field label="Height (ft)">
              <Input type="number" min={0} step="any" value={stop.buildingHeightFt ?? ""} onChange={txt("buildingHeightFt")} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Building system">
              <Input value={stop.buildingSystem ?? ""} onChange={txt("buildingSystem")} />
            </Field>
            <Field label="Manufacturer">
              <Input value={stop.manufacturerName ?? ""} onChange={txt("manufacturerName")} />
            </Field>
          </div>
          <Field label="Doors, windows, framed openings, lean-tos">
            <Textarea value={stop.openings ?? ""} onChange={txt("openings")} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Load L (ft)">
              <Input type="number" min={0} step="any" value={stop.loadLengthFt ?? ""} onChange={txt("loadLengthFt")} />
            </Field>
            <Field label="Load W (ft)">
              <Input type="number" min={0} step="any" value={stop.loadWidthFt ?? ""} onChange={txt("loadWidthFt")} />
            </Field>
            <Field label="Load H (ft)">
              <Input type="number" min={0} step="any" value={stop.loadHeightFt ?? ""} onChange={txt("loadHeightFt")} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Weight (lbs)">
              <Input type="number" min={0} value={stop.loadWeightLbs ?? ""} onChange={txt("loadWeightLbs")} />
            </Field>
            <Field label="Piece count">
              <Input type="number" min={0} value={stop.pieceCount ?? ""} onChange={txt("pieceCount")} />
            </Field>
          </div>
          <Field label="Other details">
            <Textarea value={stop.otherDetails ?? ""} onChange={txt("otherDetails")} />
          </Field>
        </div>
      </details>

      <details className="rounded-lg border-2 border-line">
        <summary className="min-h-12 cursor-pointer px-3 py-3 font-semibold">Site, permits and equipment</summary>
        <div className="space-y-3 border-t-2 border-line p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Installation surface">
              <Select value={stop.surface ?? ""} onChange={txt("surface")}>
                <option value="">Not specified</option>
                <option value="ground">Ground</option>
                <option value="gravel">Gravel</option>
                <option value="concrete">Concrete</option>
                <option value="asphalt">Asphalt</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            <Field label="Site readiness">
              <Select value={stop.siteReadiness ?? "unknown"} onChange={txt("siteReadiness")}>
                <option value="unknown">Unknown</option>
                <option value="not_ready">Not ready</option>
                <option value="ready">Ready (per customer)</option>
                <option value="verified">Verified by us</option>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {(["plansStatus", "permitStatus", "engineeringStatus"] as const).map((k) => (
              <Field key={k} label={k === "plansStatus" ? "Plans" : k === "permitStatus" ? "Permit" : "Engineering"}>
                <Select value={stop[k] ?? "unknown"} onChange={txt(k)}>
                  {DOC_STATUS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
          <Field label="Site access and unloading constraints" hint="Visible to applicants. Don't include the address or gate codes.">
            <Textarea value={stop.siteAccessNotes ?? ""} onChange={txt("siteAccessNotes")} />
          </Field>
          <Field label="Equipment needed at this stop">
            <Checklist options={equipment} value={stop.equipmentTypeIds ?? []} onChange={(v) => set("equipmentTypeIds", v)} />
          </Field>
        </div>
      </details>

      <details className="rounded-lg border-2 border-line" open={!!stop.contactName}>
        <summary className="min-h-12 cursor-pointer px-3 py-3 font-semibold">Customer and private details</summary>
        <div className="space-y-3 border-t-2 border-line p-3">
          <p className="text-sm text-muted">Released only to the provider who accepts the assignment.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Contact name">
              <Input value={stop.contactName ?? ""} onChange={txt("contactName")} autoComplete="off" />
            </Field>
            <Field label="Phone">
              <Input type="tel" value={stop.contactPhone ?? ""} onChange={txt("contactPhone")} autoComplete="off" />
            </Field>
            <Field label="Email">
              <Input type="email" value={stop.contactEmail ?? ""} onChange={txt("contactEmail")} autoComplete="off" />
            </Field>
          </div>
          <Window
            label="Customer appointment"
            start={stop.appointmentWindowStart}
            end={stop.appointmentWindowEnd}
            onChange={(s, e) => onChange({ ...stop, appointmentWindowStart: s, appointmentWindowEnd: e })}
          />
          <Field label="Customer availability notes">
            <Textarea value={stop.customerAvailabilityNotes ?? ""} onChange={txt("customerAvailabilityNotes")} />
          </Field>
          <Field label="Access instructions (gate codes, directions)">
            <Textarea value={stop.accessInstructions ?? ""} onChange={txt("accessInstructions")} />
          </Field>
          <Field label="Safety notes">
            <Textarea value={stop.safetyNotes ?? ""} onChange={txt("safetyNotes")} />
          </Field>
        </div>
      </details>
    </div>
  );
}

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function RouteEditor({
  action,
  initial,
  categories,
  equipment,
  qualifications,
  preferred,
  submitLabel,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  initial: RouteState;
  categories: Category[];
  equipment: Option[];
  qualifications: Option[];
  preferred: Option[];
  submitLabel: string;
}) {
  const [route, setRoute] = useState<RouteState>(initial);
  const [state, formAction] = useActionState(action, undefined);
  const set = <K extends keyof RouteState>(k: K, v: RouteState[K]) => setRoute((r) => ({ ...r, [k]: v }));
  const txt = (k: keyof RouteState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    set(k, e.target.value as never);
  const category = categories.find((c) => c.id === route.buildingCategoryId);
  const allowed = category?.allowedJobTypes ?? ["delivery", "installation", "delivery_installation"];
  const needsPickup = route.jobType !== "installation";

  const updateStop = (i: number, s: StopState) => set("stops", route.stops.map((x, j) => (j === i ? s : x)));
  const moveStop = (i: number, dir: -1 | 1) => {
    const next = [...route.stops];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    set("stops", next);
  };

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="payload" value={JSON.stringify(route)} />
      {state?.error && <Alert>{state.error}</Alert>}

      <Section title="Basics">
        <Field label="Route title" hint="Short and specific, e.g. “2 red-iron kits, Tyler → Lufkin”">
          <Input value={route.title} onChange={txt("title")} maxLength={120} required />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Building category">
            <Select
              value={route.buildingCategoryId}
              onChange={(e) => {
                const c = categories.find((x) => x.id === e.target.value);
                setRoute((r) => ({
                  ...r,
                  buildingCategoryId: e.target.value,
                  jobType: c && !c.allowedJobTypes.includes(r.jobType) ? c.defaultJobType : r.jobType,
                }));
              }}
            >
              <option value="">Choose…</option>
              {categories
                .filter((c) => !c.isUmbrella)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Job type">
            <Select value={route.jobType} onChange={txt("jobType")}>
              {allowed.map((j) => (
                <option key={j} value={j}>
                  {JOB_LABEL[j]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Crew size needed">
            <Input type="number" min={1} value={route.crewSizeRequired ?? ""} onChange={txt("crewSizeRequired")} />
          </Field>
          <Field label="Estimated duration (hours)">
            <Input
              type="number"
              min={0}
              step="0.5"
              value={route.estimatedDurationMinutes ? Number(route.estimatedDurationMinutes) / 60 : ""}
              onChange={(e) => set("estimatedDurationMinutes", e.target.value ? Math.round(Number(e.target.value) * 60) : null)}
            />
          </Field>
        </div>
      </Section>

      {needsPickup && (
        <Section title="Pickup" hint="Before award, providers see only the city and state.">
          <AddressFields value={route.pickup ?? emptyAddress()} onChange={(a) => set("pickup", a)} idPrefix="pickup" />
          <TzSelect value={route.pickupTimezone} onChange={(v) => set("pickupTimezone", v)} />
          <Window
            label="Pickup window"
            start={route.pickupWindowStart}
            end={route.pickupWindowEnd}
            onChange={(s, e) => setRoute((r) => ({ ...r, pickupWindowStart: s, pickupWindowEnd: e }))}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Who loads?">
              <Select value={route.loadingResponsibility ?? ""} onChange={txt("loadingResponsibility")}>
                <option value="">Not specified</option>
                <option value="poster">We load</option>
                <option value="provider">Provider loads</option>
                <option value="other">Other (see notes)</option>
              </Select>
            </Field>
            <Field label="Who unloads?">
              <Select value={route.unloadingResponsibility ?? ""} onChange={txt("unloadingResponsibility")}>
                <option value="">Not specified</option>
                <option value="provider">Provider unloads</option>
                <option value="customer">Customer unloads</option>
                <option value="other">Other (see notes)</option>
              </Select>
            </Field>
          </div>
        </Section>
      )}

      <Section title={`Stops (${route.stops.length})`} hint="In driving order. Use the arrows to reorder.">
        {route.stops.map((s, i) => (
          <StopEditor
            key={i}
            stop={s}
            index={i}
            count={route.stops.length}
            jobType={route.jobType}
            equipment={equipment}
            onChange={(x) => updateStop(i, x)}
            onMove={(d) => moveStop(i, d)}
            onRemove={() => set("stops", route.stops.filter((_, j) => j !== i))}
          />
        ))}
        <Button
          type="button"
          variant="secondary"
          onClick={() => set("stops", [...route.stops, emptyStop(route.stops.at(-1)?.timezone ?? "America/Chicago")])}
          disabled={route.stops.length >= 25}
        >
          + Add stop
        </Button>
      </Section>

      <Section title="Compensation" hint="Zero commission: you arrange payment directly with the provider.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Pricing">
            <Select value={route.compensationMode} onChange={txt("compensationMode")}>
              <option value="fixed">Fixed price</option>
              <option value="proposals">Accept proposals</option>
            </Select>
          </Field>
          <Field label="Basis">
            <Select value={route.compensationBasis} onChange={txt("compensationBasis")}>
              <option value="route_total">Total for the route</option>
              <option value="per_stop">Per stop</option>
              <option value="per_unit">Per unit</option>
            </Select>
          </Field>
          <Field label={route.compensationMode === "fixed" ? "Amount (USD)" : "Guide amount (optional, USD)"}>
            <Input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={route.compensationCents != null && route.compensationCents !== "" ? Number(route.compensationCents) / 100 : ""}
              onChange={(e) => set("compensationCents", e.target.value ? Math.round(Number(e.target.value) * 100) : null)}
            />
          </Field>
          {route.compensationBasis === "per_unit" && (
            <Field label="Unit" hint="e.g. per building, per mile">
              <Input value={route.compensationUnitLabel ?? ""} onChange={txt("compensationUnitLabel")} />
            </Field>
          )}
        </div>
      </Section>

      <Section title="Requirements">
        <Field label="Equipment">
          <Checklist options={equipment} value={route.equipmentTypeIds} onChange={(v) => set("equipmentTypeIds", v)} />
        </Field>
        <Field label="Qualifications">
          <Checklist options={qualifications} value={route.qualificationTypeIds} onChange={(v) => set("qualificationTypeIds", v)} />
        </Field>
      </Section>

      <Section title="Who can see it">
        <div className="space-y-2">
          {[
            ["marketplace", "Marketplace", "Any qualified provider can find it and apply."],
            ["preferred", "Preferred providers", "Only providers on your preferred list."],
            ["invitation", "Invitation only", "Only the providers you pick below."],
          ].map(([v, t, d]) => (
            <label key={v} className="flex min-h-14 cursor-pointer gap-3 rounded-lg border-2 border-line p-3 has-[:checked]:border-brand">
              <input
                type="radio"
                name="visibility-ui"
                className="mt-1 h-5 w-5 accent-[var(--brand)]"
                checked={route.visibility === v}
                onChange={() => set("visibility", v)}
              />
              <span>
                <span className="block font-semibold">{t}</span>
                <span className="block text-sm text-muted">{d}</span>
              </span>
            </label>
          ))}
        </div>
        {route.visibility === "invitation" &&
          (preferred.length ? (
            <Field label="Invite these providers">
              <Checklist options={preferred} value={route.invitedProviderOrgIds} onChange={(v) => set("invitedProviderOrgIds", v)} />
            </Field>
          ) : (
            <Alert kind="info">Add providers to your preferred list first (Providers page), then invite them here.</Alert>
          ))}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Application deadline (pickup time zone)">
            <Input type="datetime-local" value={route.applicationDeadline ?? ""} onChange={(e) => set("applicationDeadline", e.target.value || null)} />
          </Field>
          <Field label="Listing expires">
            <Input type="datetime-local" value={route.expiresAt ?? ""} onChange={(e) => set("expiresAt", e.target.value || null)} />
          </Field>
        </div>
      </Section>

      <Section title="Notes">
        <Field label="For applicants" hint="Visible to providers evaluating the route.">
          <Textarea value={route.providerNotes ?? ""} onChange={txt("providerNotes")} rows={4} />
        </Field>
        <Field label="For the accepted provider only" hint="Released after they accept.">
          <Textarea value={route.assignmentNotes ?? ""} onChange={txt("assignmentNotes")} rows={4} />
        </Field>
        <Field label="Internal (your team only)" hint="Never shown to providers.">
          <Textarea value={route.internalNotes ?? ""} onChange={txt("internalNotes")} rows={3} />
        </Field>
      </Section>

      {state?.error && <Alert>{state.error}</Alert>}
      <div className="sticky bottom-0 -mx-4 border-t-2 border-line bg-white/95 px-4 py-3 backdrop-blur">
        <SaveButton label={submitLabel} />
      </div>
    </form>
  );
}
