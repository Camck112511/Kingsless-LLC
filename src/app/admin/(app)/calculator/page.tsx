import { Calculator } from "@/components/admin/calculator";
import { requireAdmin } from "@/server/auth";

export default async function Page() {
  await requireAdmin();
  return <Calculator />;
}
