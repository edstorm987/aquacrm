import { redirect } from "next/navigation";

export default async function ProductsPage() {
  redirect("/portal/agency/company?view=products");
}
