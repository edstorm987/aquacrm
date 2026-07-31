import { redirect } from "next/navigation";
import PortalShell from "@/components/PortalShell";
import { getPortalSession } from "@/lib/auth";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getPortalSession();
  if (!session) redirect("/login?next=/portal");
  return <PortalShell session={session}>{children}</PortalShell>;
}
