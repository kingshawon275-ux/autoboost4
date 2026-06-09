import { PanelsClient } from "@/components/panels/panels-client";
import { guardPage } from "@/lib/guard";

export default async function PanelsPage() {
  const session = await guardPage("/panels");
  // USERs with view permission see panels read-only; only admin/mod can manage.
  const canManage = session.user.role === "ADMIN" || session.user.role === "MODERATOR";
  return <PanelsClient canManage={canManage} />;
}
