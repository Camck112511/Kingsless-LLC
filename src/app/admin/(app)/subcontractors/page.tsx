import { Subcontractors } from "@/components/admin/subcontractors";
import { requireAdmin } from "@/server/auth";

export default async function Page() {
  await requireAdmin();
  return <Subcontractors />;
}
