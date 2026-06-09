import { handle, ok, requireUser } from "@/lib/api";
import { refreshOrderStatuses } from "@/lib/smm/order-service";

export const maxDuration = 60;

export async function POST() {
  return handle(async () => {
    await requireUser();
    const result = await refreshOrderStatuses(100);
    return ok(result);
  });
}
