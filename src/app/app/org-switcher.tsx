"use client";

import { switchOrgAction } from "./actions";

export function OrgSwitcher({
  orgs,
  activeOrgId,
}: {
  orgs: { id: string; name: string }[];
  activeOrgId: string;
}) {
  if (orgs.length < 2) {
    return <span className="font-medium text-muted">{orgs[0]?.name}</span>;
  }
  return (
    <form action={switchOrgAction}>
      <label className="sr-only" htmlFor="org-switch">
        Organization
      </label>
      <select
        id="org-switch"
        name="orgId"
        defaultValue={activeOrgId}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="min-h-11 rounded-lg border-2 border-line bg-white px-2 font-medium"
      >
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </form>
  );
}
