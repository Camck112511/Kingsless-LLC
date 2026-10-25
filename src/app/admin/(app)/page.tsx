import { Dashboard } from "@/components/admin/dashboard";
import { requireAdmin } from "@/server/auth";

export default async function AdminHome() {
  await requireAdmin();
  return <Dashboard />;
}
