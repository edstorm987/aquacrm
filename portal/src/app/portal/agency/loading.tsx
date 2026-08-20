// Instant route-level skeleton for the Command Centre.
//
// Without this, Next.js has nothing to show while the agency page's server
// work resolves, so the browser sat on the previous screen (or a blank canvas)
// until everything was ready. `loading.tsx` streams immediately — the sidebar
// and topbar come from the layout, and this fills the main region with the
// Command Centre's own shape (station nav + day board) so the app feels
// instant instead of stalled. Purely presentational; no data, no logic.
export default function AgencyHomeLoading() {
  return (
    <div className="mm-command-center-workspace mx-auto flex w-full max-w-[1600px] animate-pulse flex-col gap-5 pb-6" aria-hidden>
      <div className="h-6 w-64 rounded bg-[#62e8ff]/10" />

      {/* Station nav */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-20 rounded-md border border-[#62e8ff]/20 bg-[#020b11]" />
        ))}
      </div>

      {/* Day board */}
      <div className="min-h-[42rem] rounded-md border border-[#62e8ff]/30 bg-[#020b11] p-5">
        <div className="mb-6 h-5 w-48 rounded bg-[#62e8ff]/10" />
        <div className="mb-6 grid gap-4 sm:grid-cols-5">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="h-16 rounded bg-[#62e8ff]/[0.07]" />
          ))}
        </div>
        <div className="mb-4 h-12 rounded bg-[#62e8ff]/[0.07]" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="h-40 rounded bg-[#62e8ff]/[0.05]" />
          <div className="h-40 rounded bg-[#62e8ff]/[0.05]" />
        </div>
      </div>

      <span className="sr-only" role="status" aria-live="polite">Loading Command Centre…</span>
    </div>
  );
}
