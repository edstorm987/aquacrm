"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { checkedJsonMutation, mutationErrorMessage } from "@/lib/client/checkedMutation";
import { hexColour } from "@/lib/brands/brandFieldValidation";

/**
 * The workspace identity, editable at last.
 *
 * Ed, 2026-08-30: *"Active / AquaOasis-Web / Slug / milesymedia / Brand colour /
 * #0B6F6D ... allow these to be changed"* — they were three read-only Stat
 * tiles, because no write path existed for a non-founder (see the route's
 * header). Two components from one file because the two controls belong to two
 * tabs: the NAME is business identity, the COLOUR is appearance. Both post to
 * the same route; scope-splitting the UI does not fork the write path.
 */

const control = "min-h-11 w-full rounded-md border border-black/15 bg-white px-3 text-sm outline-none focus:border-black/35 disabled:bg-black/[0.03] disabled:text-black/40";

export function WorkspaceNamePanel({ initialName, slug, canManage }: {
  initialName: string;
  slug: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [status, setStatus] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("Saving…");
    try {
      await checkedJsonMutation("/api/portal/agency/identity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      }, { fallback: "The workspace name could not be saved." });
      setStatus("Workspace name saved.");
      router.refresh();
    } catch (error) {
      setStatus(mutationErrorMessage(error, "The workspace name could not be saved."));
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <label className="grid gap-1.5">
        <span className="text-xs font-semibold text-black/55">Workspace name</span>
        <input value={name} onChange={event => setName(event.target.value)} className={control} disabled={!canManage} maxLength={120} />
      </label>
      <label className="grid gap-1.5">
        <span className="text-xs font-semibold text-black/55">Workspace address</span>
        {/* Read-only WITH the reason on the field. The old tile taught people
            name/slug/colour were one editable set; dropping the slug silently
            would read as a bug. It is authority, not presentation — public
            enquiry routes resolve this workspace by it. */}
        <input value={slug} readOnly aria-readonly className={`${control} text-black/45`} />
        <span className="text-[11px] leading-4 text-black/40">
          Fixed. Changing it would move where public enquiry forms deliver.
        </span>
      </label>
      <div className="sm:col-span-2 flex items-center gap-3">
        <button type="submit" disabled={!canManage} className="rounded-md bg-black/85 px-3.5 py-2 text-sm font-semibold text-white hover:bg-black disabled:bg-black/20">
          Save name
        </button>
        <span role="status" className="text-xs text-black/50">{status}</span>
      </div>
    </form>
  );
}

export function BrandColourPanel({ initialColour, canManage }: {
  initialColour: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [colour, setColour] = useState(initialColour || "#0B6F6D");
  const [status, setStatus] = useState("");
  const problem = hexColour(colour);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (problem) { setStatus(problem); return; }
    setStatus("Saving…");
    try {
      await checkedJsonMutation("/api/portal/agency/identity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brand: { primaryColor: colour } }),
      }, { fallback: "The brand colour could not be saved." });
      setStatus("Brand colour saved. It applies from the next page load.");
      router.refresh();
    } catch (error) {
      setStatus(mutationErrorMessage(error, "The brand colour could not be saved."));
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1.5">
        <span className="text-xs font-semibold text-black/55">Brand colour</span>
        <span className="flex items-center gap-2">
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(colour) ? colour : "#0B6F6D"}
            onChange={event => setColour(event.target.value)}
            disabled={!canManage}
            aria-label="Pick the brand colour"
            className="h-11 w-14 cursor-pointer rounded-md border border-black/15 bg-white p-1 disabled:cursor-default"
          />
          <input
            value={colour}
            onChange={event => setColour(event.target.value)}
            className={`${control} w-36 font-mono`}
            disabled={!canManage}
            aria-label="Brand colour hex value"
          />
        </span>
      </label>
      <button type="submit" disabled={!canManage || Boolean(problem)} className="rounded-md bg-black/85 px-3.5 py-2 text-sm font-semibold text-white hover:bg-black disabled:bg-black/20">
        Save colour
      </button>
      <span role="status" className="text-xs text-black/50">{problem && colour ? problem : status}</span>
    </form>
  );
}
