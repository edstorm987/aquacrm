// Read-only settings overview for v1. Editable settings flow through
// the manifest's `settings` schema; this page is a place to summarise
// install-level config + workforce health.

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function SettingsPage(props: PluginPageProps) {
  const { staff, departments, leave } = containerFor({
    agencyId: props.agencyId,
    storage: props.storage,
  });

  const [allStaff, allDepartments, allLeave] = await Promise.all([
    staff.list(),
    departments.list(),
    leave.list(),
  ]);

  const active = allStaff.filter(s => s.status === "active").length;
  const onLeave = allStaff.filter(s => s.status === "on-leave").length;
  const alumni = allStaff.filter(s => s.status === "alumni").length;
  const pending = allLeave.filter(l => l.status === "pending").length;

  return (
    <section className="hr-settings">
      <header><h1>Settings</h1><p>Install state for agency-HR.</p></header>
      <dl className="hr-settings-grid">
        <div><dt>Active staff</dt><dd>{active}</dd></div>
        <div><dt>On leave</dt><dd>{onLeave}</dd></div>
        <div><dt>Alumni</dt><dd>{alumni}</dd></div>
        <div><dt>Departments</dt><dd>{allDepartments.length}</dd></div>
        <div><dt>Pending leave requests</dt><dd>{pending}</dd></div>
      </dl>
      <h2>Install</h2>
      <dl className="hr-settings-grid">
        <div><dt>Plugin id</dt><dd>{props.install.pluginId}</dd></div>
        <div><dt>Enabled</dt><dd>{props.install.enabled ? "Yes" : "No"}</dd></div>
        <div><dt>Installed at</dt><dd>{new Date(props.install.installedAt).toISOString()}</dd></div>
      </dl>
    </section>
  );
}
