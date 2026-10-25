import { OpportunityDetail } from "@/components/admin/opportunity/detail";
import { requireAdmin } from "@/server/auth";
import { capabilities } from "@/server/views";

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  return <OpportunityDetail id={decodeURIComponent(id)} caps={capabilities()} />;
}
