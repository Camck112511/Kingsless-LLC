import { Settings } from "@/components/admin/settings";
import { requireAdmin } from "@/server/auth";

export default async function Page() {
  await requireAdmin();
  return <Settings />;
}
