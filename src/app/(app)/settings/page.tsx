import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MappingsManager } from "@/components/settings/mappings-manager";
import { CurrencySettings } from "@/components/settings/currency-settings";

export default async function SettingsPage() {
  const session = await auth();
  const user = session?.user;

  return (
    <div>
      <PageHeader title="Settings" description="Manage your account and service routing." />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Name" value={user?.name || "—"} />
            <Field label="Email" value={user?.email || "—"} />
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Role</p>
              <Badge variant="default" className="mt-1 capitalize">
                {user?.role?.toLowerCase() || "user"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {user?.role === "ADMIN" && <CurrencySettings />}

        <MappingsManager />
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}
