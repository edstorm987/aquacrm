import { NextResponse } from "next/server";

import { findCommercialProposal } from "@/lib/server/commercialProposal";

export async function POST(req: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const proposal = await findCommercialProposal(token);
  if (!proposal) return NextResponse.json({ ok: false, error: "Proposal not found." }, { status: 404 });
  const body = await req.json().catch(() => null) as { acceptedBy?: string; confirmed?: boolean } | null;
  const acceptedBy = body?.acceptedBy?.trim();
  if (!acceptedBy || !body?.confirmed) {
    return NextResponse.json({ ok: false, error: "Enter your name and confirm the agreement." }, { status: 400 });
  }
  const pack = await proposal.accept(acceptedBy);
  return NextResponse.json({ ok: true, status: pack?.agreementStatus, acceptedAt: pack?.acceptedAt });
}
