import { redirect } from "next/navigation";

// Compatibility route only. The destination renders the canonical
// id="main-content" landmark and the working profile controls.
export default function PreferencesPage() {
  redirect("/portal/account");
}
