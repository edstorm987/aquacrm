import { PanelsTopLeft } from "lucide-react";
import AquaAccount from "@/components/AquaAccount";
import { getPortalSession } from "@/lib/auth";

export default async function AquaPage() {
  const session = await getPortalSession();
  return (
    <main className="page-stack aqua-page">
      <header className="page-heading">
        <span className="eyebrow"><PanelsTopLeft size={14} /> {session?.role === "admin" ? "AquaOasis-Web" : "Your Aqua account"}</span>
        <h1>{session?.role === "admin" ? "Shared service workspace" : "Plans, billing and support"}</h1>
        <p>{session?.role === "admin" ? "The Aqua relationship layer is embedded from its own server. This repository contains none of its application code." : "Your Milesymedia account information, supplied securely by Aqua."}</p>
      </header>
      <AquaAccount />
    </main>
  );
}
