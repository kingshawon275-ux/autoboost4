import { handle, ok, requireRole, requireUser } from "@/lib/api";
import { getSettings, updateSettings } from "@/lib/settings";
import { z } from "zod";

export async function GET() {
  return handle(async () => {
    await requireUser();
    const s = await getSettings();
    return ok(s);
  });
}

const schema = z.object({
  displayCurrency: z.enum(["USD", "BDT"]).optional(),
  bdtRate: z.coerce.number().positive().optional(),
  lowBalanceThreshold: z.coerce.number().nonnegative().optional(),
  quickQuantities: z.array(z.coerce.number().int().positive()).max(8).optional(),
});

export async function PATCH(req: Request) {
  return handle(async () => {
    await requireRole(["ADMIN"]);
    const body = await req.json();
    const data = schema.parse(body);
    await updateSettings(data);
    const s = await getSettings();
    return ok(s);
  });
}
