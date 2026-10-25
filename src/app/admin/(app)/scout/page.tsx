import { Scout } from "@/components/admin/scout";
import { requireAdmin } from "@/server/auth";
import { capabilities } from "@/server/views";

export const metadata = { title: "Find bids" };

export default async function Page() {
  await requireAdmin();
  return <Scout caps={capabilities()} />;
}
