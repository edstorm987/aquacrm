import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { MILESYMEDIA_HOME_PATH } from "@/lib/public/milesymediaRoutes";

export function WebsitePageUpdating({ label, message }: { label: string; message?: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#100c07] px-5 text-[#F7EFE2]">
      <section className="w-full max-w-xl border-y border-[#D4B888]/25 py-12 text-center">
        <span className="mx-auto grid size-11 place-items-center rounded bg-[#D4B888] text-[#171009]"><RefreshCw size={19} /></span>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-[#D4B888]">Page update</p>
        <h1 className="mt-2 text-4xl font-semibold">{label} is being updated.</h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-[#D8C6A8]">
          {message || "We are making a focused improvement to this page. The rest of Milesymedia remains available."}
        </p>
        <div className="mt-7 flex justify-center gap-2">
          <Link href={MILESYMEDIA_HOME_PATH} className="rounded bg-[#D4B888] px-4 py-2 text-sm font-semibold text-[#171009]">Back to Milesymedia</Link>
          <Link href="/login" className="rounded border border-[#D4B888]/35 px-4 py-2 text-sm font-semibold">Client sign in</Link>
        </div>
      </section>
    </main>
  );
}
