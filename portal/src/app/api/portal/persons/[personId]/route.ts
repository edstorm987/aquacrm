import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth";
import { isWebsiteEnquiryClassification } from "@/lib/enquiryClassification";
import {
  addPersonEmail,
  addPersonPhone,
  addPersonRecord,
  attachPersonFacet,
  deletePersonRecord,
  classifyPerson,
  decidePersonOrganisation,
  editPersonEmail,
  editPersonPhone,
  getPerson,
  IdentityInUseError,
  primaryEmail,
  primaryPhone,
  removePersonEmail,
  removePersonPhone,
  updatePerson,
} from "@/server/persons";
import { createClient } from "@/server/tenants";
import { seedClientFromPerson } from "@/lib/server/seedClientFromPerson";
import { getOrganisation, upsertOrganisation } from "@/server/organisations";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";

const WRITE_ROLES = ["agency-owner", "agency-manager", "agency-staff"] as const;

/**
 * Every mutation the contact card can make. One route with an `action`
 * discriminator keeps the card's write surface in a single place, so scope
 * enforcement cannot drift between related operations.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ personId: string }> },
) {
  try {
    await ensureHydrated({ fresh: true });
    const session = await requireRole([...WRITE_ROLES]);
    const { personId } = await context.params;

    // Scope check before anything else — a person from another agency must
    // be indistinguishable from one that does not exist.
    const person = getPerson(session.agencyId, personId);
    if (!person) {
      return NextResponse.json({ ok: false, error: "Contact not found." }, { status: 404 });
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const action = typeof body?.action === "string" ? body.action : "";

    switch (action) {
      case "classify": {
        if (!isWebsiteEnquiryClassification(body?.classification)) {
          return NextResponse.json({ ok: false, error: "A valid classification is required." }, { status: 400 });
        }
        const updated = classifyPerson(session.agencyId, personId, {
          classification: body.classification,
          by: session.userId,
          note: typeof body.note === "string" ? body.note : undefined,
        });
        await flushPendingWrites();
        return NextResponse.json({ ok: true, person: updated });
      }

      case "update": {
        const updated = updatePerson(session.agencyId, personId, {
          name: typeof body?.name === "string" ? body.name : undefined,
          company: typeof body?.company === "string" ? body.company : undefined,
          jobTitle: typeof body?.jobTitle === "string" ? body.jobTitle : undefined,
          notes: typeof body?.notes === "string" ? body.notes : undefined,
          isPrimaryContact: typeof body?.isPrimaryContact === "boolean" ? body.isPrimaryContact : undefined,
          customFields: isStringRecord(body?.customFields) ? body.customFields : undefined,
        });
        await flushPendingWrites();
        return NextResponse.json({ ok: true, person: updated });
      }

      case "add-email": {
        const value = typeof body?.value === "string" ? body.value : "";
        const updated = addPersonEmail(session.agencyId, personId, value, {
          label: typeof body?.label === "string" ? body.label : undefined,
          isPrimary: body?.isPrimary === true,
        });
        if (!updated) {
          return NextResponse.json({ ok: false, error: "That email address could not be read." }, { status: 400 });
        }
        await flushPendingWrites();
        return NextResponse.json({ ok: true, person: updated });
      }

      case "add-phone": {
        const value = typeof body?.value === "string" ? body.value : "";
        const updated = addPersonPhone(session.agencyId, personId, value, {
          label: typeof body?.label === "string" ? body.label : undefined,
          isPrimary: body?.isPrimary === true,
        });
        if (!updated) {
          return NextResponse.json({ ok: false, error: "That phone number could not be read." }, { status: 400 });
        }
        await flushPendingWrites();
        return NextResponse.json({ ok: true, person: updated });
      }

      case "edit-email":
      case "edit-phone": {
        const current = typeof body?.current === "string" ? body.current : "";
        const edit = action === "edit-email" ? editPersonEmail : editPersonPhone;
        try {
          const updated = edit(session.agencyId, personId, current, {
            value: typeof body?.value === "string" ? body.value : undefined,
            label: typeof body?.label === "string" ? body.label : undefined,
            isPrimary: typeof body?.isPrimary === "boolean" ? body.isPrimary : undefined,
          });
          await flushPendingWrites();
          return NextResponse.json({ ok: true, person: updated });
        } catch (error) {
          // A collision is the operator's to resolve, not a server fault —
          // tell them whose card holds it so they can merge or correct.
          const conflictingPersonId = error instanceof IdentityInUseError
            ? error.conflictingPersonId
            : undefined;
          return NextResponse.json({
            ok: false,
            error: error instanceof Error ? error.message : "That value could not be saved.",
            conflictingPersonId,
          }, { status: 409 });
        }
      }

      case "remove-email":
      case "remove-phone": {
        const value = typeof body?.value === "string" ? body.value : "";
        const remove = action === "remove-email" ? removePersonEmail : removePersonPhone;
        const updated = remove(session.agencyId, personId, value);
        await flushPendingWrites();
        return NextResponse.json({ ok: true, person: updated });
      }

      case "add-record": {
        const kind = body?.kind;
        if (kind !== "meeting" && kind !== "call" && kind !== "note") {
          return NextResponse.json({ ok: false, error: "Choose meeting, call or note." }, { status: 400 });
        }
        try {
          const updated = addPersonRecord(session.agencyId, personId, {
            kind,
            summary: typeof body?.summary === "string" ? body.summary : "",
            body: typeof body?.body === "string" ? body.body : undefined,
            location: typeof body?.location === "string" ? body.location : undefined,
            outcome: typeof body?.outcome === "string" ? body.outcome : undefined,
            // A meeting is often typed up afterwards, so the caller may say
            // when it actually happened.
            at: typeof body?.at === "number" ? body.at : undefined,
            createdBy: session.userId,
          });
          await flushPendingWrites();
          return NextResponse.json({ ok: true, person: updated });
        } catch (error) {
          return NextResponse.json({
            ok: false,
            error: error instanceof Error ? error.message : "That could not be saved.",
          }, { status: 400 });
        }
      }

      case "delete-record": {
        const entryId = typeof body?.entryId === "string" ? body.entryId : "";
        if (!entryId) {
          return NextResponse.json({ ok: false, error: "An entry id is required." }, { status: 400 });
        }
        const updated = deletePersonRecord(session.agencyId, personId, entryId);
        await flushPendingWrites();
        return NextResponse.json({ ok: true, person: updated });
      }

      case "convert-to-client": {
        // Converting from the card, not only from the pipeline: by the time
        // you have read the enquiry and decided they are a client, sending you
        // to another screen to say so is a detour with no purpose.
        if (person.facets.clientIds?.length) {
          return NextResponse.json({
            ok: false,
            error: "This person already has a client workspace.",
            clientId: person.facets.clientIds[0],
          }, { status: 409 });
        }
        const name = typeof body?.name === "string" && body.name.trim()
          ? body.name.trim()
          : person.company?.trim() || person.name?.trim();
        if (!name) {
          return NextResponse.json({ ok: false, error: "A workspace name is required." }, { status: 400 });
        }

        const client = createClient(session.agencyId, {
          name,
          ownerEmail: primaryEmail(person),
          stage: "discovery",
          metadata: {
            clientEmail: primaryEmail(person),
            phone: primaryPhone(person),
            // Kept so the workspace can trace back to the person it came from.
            convertedFromPersonId: person.id,
          },
        });

        // Link both directions, then carry the history across. Seeding also
        // runs on the `client.created` event; both paths upsert, so a double
        // run updates rather than duplicates.
        attachPersonFacet(session.agencyId, personId, { clientIds: [client.id] });
        classifyPerson(session.agencyId, personId, {
          classification: "existing-client",
          by: session.userId,
          note: "Converted to a client from the contact card.",
        });
        await seedClientFromPerson(session.agencyId, personId, client.id).catch(() => null);

        await flushPendingWrites();
        return NextResponse.json({
          ok: true,
          clientId: client.id,
          href: `/portal/clients/${encodeURIComponent(client.id)}`,
        });
      }

      case "decide-organisation": {
        const organisationId = typeof body?.organisationId === "string" ? body.organisationId : "";
        const decision = body?.decision === "confirmed" || body?.decision === "rejected"
          ? body.decision
          : null;
        if (!organisationId || !decision) {
          return NextResponse.json({ ok: false, error: "A company and a decision are required." }, { status: 400 });
        }
        if (!getOrganisation(session.agencyId, organisationId)) {
          return NextResponse.json({ ok: false, error: "Company not found." }, { status: 404 });
        }
        const updated = decidePersonOrganisation(session.agencyId, personId, organisationId, decision, session.userId);
        await flushPendingWrites();
        return NextResponse.json({ ok: true, person: updated });
      }

      case "create-organisation": {
        // Linking to a company that does not exist yet — create and confirm
        // in one step, since the operator has already made the decision by
        // typing the name.
        const name = typeof body?.name === "string" ? body.name.trim() : "";
        if (!name) {
          return NextResponse.json({ ok: false, error: "A company name is required." }, { status: 400 });
        }
        const { organisation } = upsertOrganisation(session.agencyId, {
          name,
          domain: typeof body?.domain === "string" ? body.domain : undefined,
          classification: person.classification,
          source: "contact-card",
        });
        const updated = decidePersonOrganisation(
          session.agencyId, personId, organisation.id, "confirmed", session.userId,
        );
        await flushPendingWrites();
        return NextResponse.json({ ok: true, person: updated, organisation });
      }

      default:
        return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
    }
  } catch (error) {
    try {
      return authErrorResponse(error);
    } catch {
      console.error("[persons] mutation failed", error);
      return NextResponse.json({ ok: false, error: "The contact could not be updated." }, { status: 500 });
    }
  }
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return Boolean(value)
    && typeof value === "object"
    && Object.values(value as Record<string, unknown>).every(entry => typeof entry === "string");
}
