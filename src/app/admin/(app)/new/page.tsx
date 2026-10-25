import { NewOpportunity } from "@/components/admin/new-opportunity";
import { requireAdmin } from "@/server/auth";

export default async function Page() {
  await requireAdmin();
  return <NewOpportunity />;
}
