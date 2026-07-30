import { redirect } from "next/navigation";

export default function PortalRoot() {
  redirect("/login?brand=aquacrm&next=/portal");
}
