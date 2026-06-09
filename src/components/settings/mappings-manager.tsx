"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Link2, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/fetcher";
import { BOOST_TYPES, PLATFORMS } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";
import type { PanelDTO } from "@/lib/types";

interface Mapping {
  id: string;
  boostType: string;
  platform: string;
  panel: { id: string; name: string };
  service: { id: string; name: string; serviceId: string; rate: number };
}
interface ServiceLite {
  id: string;
  serviceId: string;
  name: string;
  rate: number;
}

export function MappingsManager() {
  const qc = useQueryClient();
  const [boostType, setBoostType] = React.useState("LIKE");
  const [platform, setPlatform] = React.useState("facebook");
  const [panelId, setPanelId] = React.useState("");
  const [serviceId, setServiceId] = React.useState("");
  const [serviceSearch, setServiceSearch] = React.useState("");

  const { data: mappings } = useQuery({
    queryKey: ["mappings"],
    queryFn: () => apiFetch<Mapping[]>("/api/mappings"),
  });
  const { data: panels } = useQuery({
    queryKey: ["panels"],
    queryFn: () => apiFetch<PanelDTO[]>("/api/panels"),
  });
  // Debounce the search so we query the server as the user types — this lets
  // search reach the FULL catalogue, not just a client-side slice.
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(serviceSearch.trim()), 250);
    return () => clearTimeout(t);
  }, [serviceSearch]);

  const { data: servicesResp } = useQuery({
    queryKey: ["panel-services", panelId, debouncedSearch],
    queryFn: () =>
      apiFetch<{ services: ServiceLite[]; total: number; returned: number }>(
        `/api/panels/${panelId}/services${debouncedSearch ? `?q=${encodeURIComponent(debouncedSearch)}` : ""}`,
      ),
    enabled: !!panelId,
  });

  const filteredServices = servicesResp?.services ?? [];
  const totalServices = servicesResp?.total ?? 0;
  const returnedServices = servicesResp?.returned ?? 0;

  const create = useMutation({
    mutationFn: () =>
      apiFetch("/api/mappings", {
        method: "POST",
        body: JSON.stringify({ boostType, platform, panelId, serviceId }),
      }),
    onSuccess: () => {
      toast.success("Mapping added");
      setServiceId("");
      qc.invalidateQueries({ queryKey: ["mappings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function remove(id: string) {
    try {
      await apiFetch(`/api/mappings/${id}`, { method: "DELETE" });
      qc.invalidateQueries({ queryKey: ["mappings"] });
      toast.success("Mapping removed");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-primary" /> Service mappings
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Map each boost type to a concrete provider service per panel. The distribution engine uses
          these to route orders.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label>Boost type</Label>
            <Select value={boostType} onValueChange={setBoostType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BOOST_TYPES.map((b) => (
                  <SelectItem key={b.value} value={b.value}>
                    {b.emoji} {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Platform</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Panel</Label>
            <Select
              value={panelId}
              onValueChange={(v) => {
                setPanelId(v);
                setServiceId("");
                setServiceSearch("");
              }}
            >
              <SelectTrigger><SelectValue placeholder="Select panel" /></SelectTrigger>
              <SelectContent>
                {panels?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Service</Label>
            <Select value={serviceId} onValueChange={setServiceId} disabled={!panelId}>
              <SelectTrigger>
                <SelectValue placeholder={panelId ? "Select service" : "Pick panel first"} />
              </SelectTrigger>
              <SelectContent>
                {/* Search box pinned at the top of the dropdown */}
                <div className="sticky top-0 z-10 bg-popover p-1.5">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={serviceSearch}
                      onChange={(e) => setServiceSearch(e.target.value)}
                      placeholder="Search by ID or name…"
                      className="h-9 pl-8"
                      // Keep typing inside the dropdown instead of triggering Radix's typeahead
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                  </div>
                </div>
                {filteredServices.length ? (
                  filteredServices.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      #{s.serviceId} · {s.name.slice(0, 40)}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="none" disabled>
                    {!panelId
                      ? "—"
                      : totalServices
                        ? "No match"
                        : "No services yet — auto-sync runs after adding a panel"}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            {panelId && totalServices > 0 && (
              <p className="text-xs text-muted-foreground">
                {debouncedSearch
                  ? `${returnedServices} match of ${totalServices.toLocaleString()} services`
                  : `${totalServices.toLocaleString()} services in this panel`}
              </p>
            )}
          </div>
          <div className="flex items-end">
            <Button
              className="w-full"
              onClick={() => create.mutate()}
              disabled={!panelId || !serviceId || create.isPending}
            >
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {mappings?.length ? (
            mappings.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-lg border border-border p-3"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="default">{m.boostType}</Badge>
                  <span className="text-muted-foreground">{m.platform}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-medium">{m.panel.name}</span>
                  <span className="text-muted-foreground">
                    #{m.service.serviceId} · {formatCurrency(m.service.rate)}/1k
                  </span>
                </div>
                <Button variant="ghost" size="icon" onClick={() => remove(m.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No mappings yet. Add one above so Auto Boost can route orders.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
