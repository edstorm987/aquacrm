import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, LockKeyhole, Radar, Route, ShieldCheck } from "lucide-react";

import { ApplicationForm } from "./_ApplicationForm";

export default function CareersPage() {
  return (
    <main className="min-h-screen bg-[#f1f1ec] text-[#151813]">
      <header className="relative min-h-[20rem] overflow-hidden bg-[#0a1916]">
        <Image src="/aquacrm-site/assets/aquacrm-workspace.png" alt="AquaCRM operating workspace" fill priority className="object-cover opacity-35" />
        <div className="absolute inset-0 bg-black/35" />
        <div className="relative mx-auto flex min-h-[20rem] max-w-6xl flex-col justify-between px-5 py-6 sm:px-8">
          <Link href="/" className="inline-flex w-fit items-center gap-2 text-sm font-medium text-white/80 hover:text-white"><ArrowLeft size={16} /> AquaCRM</Link>
          <div className="max-w-3xl pb-3">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase text-[#b9dfd3]"><Radar size={15} /> People & opportunities</p>
            <h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl">Bring your judgement, not just your CV.</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-white/70">Apply for a role, contract, commission or future opportunity. You will receive a private progress space immediately.</p>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-7 px-5 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_17rem] lg:py-12">
        <ApplicationForm />
        <aside className="space-y-6 lg:pt-1">
          <div className="border-l-2 border-[#153a32] pl-4">
            <p className="text-xs font-semibold uppercase text-[#153a32]">What happens next</p>
            <ol className="mt-4 space-y-4 text-sm text-black/60">
              <li className="flex gap-3"><Route className="mt-0.5 shrink-0 text-[#9d7b3f]" size={17} /><span><strong className="block text-[#242821]">Visible progress</strong>Every stage is retained in your private portal.</span></li>
              <li className="flex gap-3"><LockKeyhole className="mt-0.5 shrink-0 text-[#9d7b3f]" size={17} /><span><strong className="block text-[#242821]">Private by default</strong>Your CV and application are never public.</span></li>
              <li className="flex gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-[#9d7b3f]" size={17} /><span><strong className="block text-[#242821]">One identity</strong>If hired, this application becomes your onboarding workspace.</span></li>
            </ol>
          </div>
          <p className="border-t border-black/10 pt-5 text-xs leading-5 text-black/45">Your information is used only to assess and manage the opportunity you applied for. You can withdraw at any point.</p>
        </aside>
      </div>
    </main>
  );
}
