import { redirect } from "next/navigation";

export const metadata = {
  title: "Business OS | Milesymedia",
  description:
    "Open the free Milesymedia Business OS to track priorities, quick wins and your business health.",
};

export default function BusinessOSPage() {
  redirect("/business-os/app.html");
}
