import { BidWorkspace } from "@/components/admin/bid/workspace";
import { requireAdmin } from "@/server/auth";
import { capabilities } from "@/server/views";

export const metadata = { title: "Bid workspace" };

export default async function BidPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  return <BidWorkspace id={decodeURIComponent(id)} caps={capabilities()} />;
}
