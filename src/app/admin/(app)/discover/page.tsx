import { redirect } from "next/navigation";
import { requireAdmin } from "@/server/auth";

/** Discover moved into Find bids; keep old links working. */
export default async function Page() {
  await requireAdmin();
  redirect("/admin/scout");
}
