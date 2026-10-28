// Display helpers shared by route pages.
import { formatMoney } from "@/lib/time";
import { cx } from "@/components/ui";

export const JOB_TYPE_LABEL: Record<string, string> = {
  delivery: "Delivery only",
  installation: "Installation only",
  delivery_installation: "Delivery + installation",
};

const ROUTE_STATUS: Record<string, [string, string]> = {
  draft: ["Draft", "bg-surface text-foreground"],
  published: ["Open for applications", "bg-blue-100 text-blue-900"],
  awarding: ["Award pending", "bg-amber-100 text-amber-900"],
  assigned: ["Assigned", "bg-green-100 text-green-900"],
  in_progress: ["In progress", "bg-green-100 text-green-900"],
  pending_review: ["Awaiting review", "bg-amber-100 text-amber-900"],
  completed: ["Completed", "bg-green-100 text-green-900"],
  expired: ["Expired", "bg-surface text-muted"],
  cancelled: ["Cancelled", "bg-red-100 text-red-900"],
};

const APP_STATUS: Record<string, [string, string]> = {
  submitted: ["Applied", "bg-blue-100 text-blue-900"],
  shortlisted: ["Shortlisted", "bg-blue-100 text-blue-900"],
  declined: ["Not selected", "bg-surface text-muted"],
  withdrawn: ["Withdrawn", "bg-surface text-muted"],
  awarded: ["Awarded: respond", "bg-amber-100 text-amber-900"],
  accepted: ["Accepted", "bg-green-100 text-green-900"],
  not_selected: ["Not selected", "bg-surface text-muted"],
};

export function StatusBadge({ status, kind = "route" }: { status: string; kind?: "route" | "application" }) {
  const [label, cls] = (kind === "route" ? ROUTE_STATUS : APP_STATUS)[status] ?? [status, "bg-surface"];
  return <span className={cx("inline-block rounded-full px-3 py-1 text-sm font-semibold", cls)}>{label}</span>;
}

export function compensationText(r: {
  compensationMode: string;
  compensationBasis: string;
  compensationUnitLabel?: string | null;
  compensationCents: number | null;
}, hidden = false) {
  if (hidden) return "Hidden for your role";
  const basis =
    r.compensationBasis === "per_stop" ? " per stop" : r.compensationBasis === "per_unit" ? ` ${r.compensationUnitLabel ?? "per unit"}` : " total";
  if (r.compensationMode === "proposals") {
    return r.compensationCents ? `Proposals (guide ${formatMoney(r.compensationCents)}${basis})` : "Accepting proposals";
  }
  return r.compensationCents ? `${formatMoney(r.compensationCents)}${basis}` : "Not set";
}
