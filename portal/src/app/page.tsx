import { redirect } from "next/navigation";

export default function PortalRoot() {
  redirect("/login?brand=aqua&next=/portal");
}
