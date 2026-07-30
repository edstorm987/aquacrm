import { redirect } from "next/navigation";

export default function PortalRoot() {
  redirect("/login?next=/portal");
}
