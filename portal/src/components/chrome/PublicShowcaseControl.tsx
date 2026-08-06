import Link from "next/link";

export function PublicShowcaseControl() {
  return (
    <div className="flex items-center gap-2 rounded-md border border-emerald-700/20 bg-emerald-50 px-2 py-1 text-emerald-900">
      <span className="flex items-center gap-1.5 font-semibold">
        <i className="h-1.5 w-1.5 rounded-full bg-emerald-600" aria-hidden="true" />
        Interactive demo
      </span>
      <span className="hidden text-emerald-800/65 lg:inline">Fictional data · Read-only</span>
      <Link className="font-semibold underline decoration-emerald-800/30 underline-offset-2 hover:decoration-emerald-800" href="/showcase/exit">
        Exit
      </Link>
    </div>
  );
}
