import { Discover } from "@/components/admin/discover";
import { requireAdmin } from "@/server/auth";

export default async function Page() {
  await requireAdmin();
  return <Discover />;
}
