import { redirect } from "next/navigation";

export default async function ProductsPage() {
  redirect("/portal/agency/fulfilment?view=services");
}
