import "server-only";

type EnquiryEmailInput = {
  brand: string;
  name: string;
  email: string | null;
  phone: string | null;
  contactMethod: string | null;
  services: string[];
  message: string | null;
  sourceUrl: string | null;
  campaign: string | null;
};

function brandName(slug: string) {
  const names: Record<string, string> = {
    aquacrm: "AquaCRM",
    "aquaoasis-web": "AquaOasis-Web",
    milesymedia: "Milesymedia",
    "zimante-group": "Zimante Group",
  };
  return names[slug] ?? slug;
}

function htmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function line(label: string, value: string | null | undefined) {
  if (!value) return "";
  return `<tr><td style="padding:8px 14px;color:#6f6a63;width:150px">${label}</td><td style="padding:8px 14px;color:#181512"><strong>${htmlEscape(value)}</strong></td></tr>`;
}

export async function notifyEnquiry(input: EnquiryEmailInput) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const notifyTo = process.env.ENQUIRY_NOTIFY_TO?.trim() || "edwardhallam07@gmail.com";
  const from = process.env.ENQUIRY_EMAIL_FROM?.trim() || "AquaCRM <onboarding@resend.dev>";

  if (!apiKey) {
    return { attempted: false, sent: false, reason: "RESEND_API_KEY is not configured." };
  }

  const subject = `New ${brandName(input.brand)} enquiry from ${input.name}`;
  const services = input.services.length ? input.services.join(", ") : "Not specified";
  const text = [
    subject,
    "",
    `Brand: ${brandName(input.brand)}`,
    `Name: ${input.name}`,
    `Email: ${input.email || "Not provided"}`,
    `Phone: ${input.phone || "Not provided"}`,
    `Best contact: ${input.contactMethod || "Not specified"}`,
    `Services: ${services}`,
    `Campaign: ${input.campaign || "None"}`,
    `Source: ${input.sourceUrl || "Unknown"}`,
    "",
    input.message || "No message supplied.",
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;background:#f6f3ee;padding:28px">
      <div style="max-width:680px;background:#fff;border:1px solid #ded7cf;padding:28px;margin:auto">
        <p style="margin:0 0 10px;color:#8a6444;font-size:12px;text-transform:uppercase;letter-spacing:1px">${htmlEscape(brandName(input.brand))}</p>
        <h1 style="margin:0 0 18px;font-size:28px;color:#181512">New enquiry from ${htmlEscape(input.name)}</h1>
        <table style="width:100%;border-collapse:collapse;border-top:1px solid #eee;border-bottom:1px solid #eee">
          ${line("Email", input.email || "Not provided")}
          ${line("Phone", input.phone || "Not provided")}
          ${line("Best contact", input.contactMethod || "Not specified")}
          ${line("Services", services)}
          ${line("Campaign", input.campaign || "None")}
          ${line("Source", input.sourceUrl || "Unknown")}
        </table>
        <h2 style="margin:24px 0 10px;font-size:16px;color:#181512">Message</h2>
        <p style="white-space:pre-wrap;line-height:1.65;color:#3f3933">${htmlEscape(input.message || "No message supplied.")}</p>
      </div>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [notifyTo],
      reply_to: input.email || undefined,
      subject,
      text,
      html,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend notification failed: ${response.status} ${body}`);
  }

  return { attempted: true, sent: true, reason: null };
}
