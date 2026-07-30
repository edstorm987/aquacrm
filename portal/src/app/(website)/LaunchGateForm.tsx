"use client";

import { useState } from "react";

const defaultServices = [
  "Business & events",
  "Staff & personal branding",
  "Property",
  "Automotive",
  "Weddings & personal shoots",
  "Sport & action",
];

export function LaunchGateForm({
  brand = "milesymedia",
  services = defaultServices,
}: {
  brand?: "milesymedia" | "zimante-group" | "aquaoasis-web" | "software-studio";
  services?: string[];
}) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="grid gap-5 sm:grid-cols-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const values = new FormData(form);
        setSent(false);
        setError(null);
        setBusy(true);
        try {
          const response = await fetch("/api/public/brand-enquiry", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: values.get("name"),
              email: values.get("email"),
              phone: values.get("phone"),
              contactMethod: values.get("contactMethod"),
              services: values.getAll("services"),
              message: values.get("note"),
              brand,
              sourceUrl: window.location.href,
              campaign: new URLSearchParams(window.location.search).get("utm_campaign") ?? "",
              consent: values.get("consent") === "yes",
              website: values.get("website"),
            }),
          });
          const payload = await response.json() as { ok?: boolean; error?: string };
          if (!response.ok || !payload.ok) {
            throw new Error(payload.error || "We could not send your message.");
          }
          form.reset();
          setSent(true);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "We could not send your message.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="hidden" aria-hidden="true">
        <label>
          Website
          <input name="website" type="text" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-[#22231F]">Name</span>
        <input
          required
          type="text"
          name="name"
          autoComplete="name"
          placeholder="Your name"
          className="h-12 w-full rounded-md border border-[#CFCFC8] bg-[#FAFAF7] px-4 text-base text-[#171714] outline-none transition placeholder:text-[#8C908B] focus:border-[#28736B] focus:bg-white focus:ring-2 focus:ring-[#28736B]/12"
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-[#22231F]">Email</span>
        <input
          required
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@example.com"
          className="h-12 w-full rounded-md border border-[#CFCFC8] bg-[#FAFAF7] px-4 text-base text-[#171714] outline-none transition placeholder:text-[#8C908B] focus:border-[#28736B] focus:bg-white focus:ring-2 focus:ring-[#28736B]/12"
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-[#22231F]">
          Phone <span className="font-normal text-[#71766F]">(optional)</span>
        </span>
        <input
          type="tel"
          name="phone"
          autoComplete="tel"
          placeholder="Your phone number"
          className="h-12 w-full rounded-md border border-[#CFCFC8] bg-[#FAFAF7] px-4 text-base text-[#171714] outline-none transition placeholder:text-[#8C908B] focus:border-[#28736B] focus:bg-white focus:ring-2 focus:ring-[#28736B]/12"
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-[#22231F]">Best way to reach you</span>
        <select
          required
          name="contactMethod"
          defaultValue=""
          className="h-12 w-full rounded-md border border-[#CFCFC8] bg-[#FAFAF7] px-4 text-base text-[#171714] outline-none transition focus:border-[#28736B] focus:bg-white focus:ring-2 focus:ring-[#28736B]/12"
        >
          <option value="" disabled>
            Choose one
          </option>
          <option value="in-person">In person meetup</option>
          <option value="call">Call</option>
          <option value="text">Text</option>
          <option value="email">Email</option>
          <option value="whatsapp">WhatsApp</option>
        </select>
      </label>
      <label className="block sm:col-span-2">
        <span className="mb-3 block text-sm font-semibold text-[#22231F]">
          What would you like help with? <span className="font-normal text-[#71766F]">(choose any)</span>
        </span>
        <span className="grid gap-2 sm:grid-cols-2">
          {services.map((service) => (
            <span
              key={service}
              className="flex min-h-11 items-center gap-3 rounded-md border border-[#CFCFC8] bg-[#FAFAF7] px-3 text-sm font-medium"
            >
              <input
                type="checkbox"
                name="services"
                value={service}
                className="h-4 w-4 accent-[#8D5D3D]"
              />
              {service}
            </span>
          ))}
        </span>
      </label>
      <label className="block sm:col-span-2">
        <span className="mb-2 block text-sm font-semibold text-[#22231F]">Tell us about the shoot</span>
        <textarea
          name="note"
          rows={4}
          placeholder="A rough idea is plenty: what, where and when?"
          className="w-full resize-none rounded-md border border-[#CFCFC8] bg-[#FAFAF7] px-4 py-3 text-base text-[#171714] outline-none transition placeholder:text-[#8C908B] focus:border-[#28736B] focus:bg-white focus:ring-2 focus:ring-[#28736B]/12"
        />
      </label>
      <label className="flex items-start gap-3 text-sm leading-6 text-[#5D625D] sm:col-span-2">
        <input
          required
          type="checkbox"
          name="consent"
          value="yes"
          className="mt-1 h-4 w-4 shrink-0 accent-[#8D5D3D]"
        />
        <span>
          I agree that my details can be used to reply to this enquiry. They will be managed
          centrally by Zimante Group for the selected specialist.
        </span>
      </label>
      <button
        type="submit"
        disabled={busy}
        className="h-12 w-full rounded-md bg-[#6F452F] px-5 text-base font-semibold text-white transition hover:bg-[#593623] disabled:cursor-wait disabled:opacity-65 sm:col-span-2"
      >
        {busy ? "Sending..." : "Send message"}
      </button>
      {sent && (
        <p role="status" className="rounded-md border border-[#8FC1B8] bg-[#EAF4F1] px-4 py-3 text-sm text-[#205F59] sm:col-span-2">
          Thank you. Your brief is with Milesymedia and we will be in touch soon.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:col-span-2">
          {error}
        </p>
      )}
    </form>
  );
}
