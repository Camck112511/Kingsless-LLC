import { OpportunityDetail } from "@/components/admin/opportunity/detail";
import { requireAdmin } from "@/server/auth";

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  return <OpportunityDetail id={decodeURIComponent(id)} />;
}
