"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/fetcher";
import type { PanelDTO } from "@/lib/types";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  panel?: PanelDTO | null;
};

export function PanelFormDialog({ open, onOpenChange, panel }: Props) {
  const qc = useQueryClient();
  const isEdit = !!panel;
  const [form, setForm] = React.useState({
    name: "",
    apiUrl: "",
    apiKey: "",
    currency: "USD",
    priority: "0",
    notes: "",
  });

  React.useEffect(() => {
    if (open) {
      setForm({
        name: panel?.name ?? "",
        apiUrl: panel?.apiUrl ?? "",
        apiKey: "",
        currency: panel?.currency ?? "USD",
        priority: String(panel?.priority ?? 0),
        notes: panel?.notes ?? "",
      });
    }
  }, [open, panel]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        name: form.name,
        apiUrl: form.apiUrl,
        currency: form.currency,
        priority: Number(form.priority) || 0,
        notes: form.notes,
      };
      if (form.apiKey) payload.apiKey = form.apiKey;
      if (isEdit) {
        return apiFetch(`/api/panels/${panel!.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }
      return apiFetch("/api/panels", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["panels"] });
      toast.success(isEdit ? "Panel updated" : "Panel added");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit panel" : "Add SMM panel"}</DialogTitle>
          <DialogDescription>
            Connect a panel using the standard SMM v2 API. The API key is encrypted at rest and
            never returned to the browser.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="name">Panel name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="My Panel #1"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="apiUrl">API URL</Label>
            <Input
              id="apiUrl"
              value={form.apiUrl}
              onChange={(e) => setForm((f) => ({ ...f, apiUrl: e.target.value }))}
              placeholder="https://panel.example.com/api/v2"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="apiKey">
              API key {isEdit && <span className="text-muted-foreground">(leave blank to keep)</span>}
            </Label>
            <Input
              id="apiKey"
              type="password"
              value={form.apiKey}
              onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
              placeholder="••••••••••••"
              required={!isEdit}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Input
                id="currency"
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
                placeholder="USD"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Input
                id="priority"
                type="number"
                min={0}
                max={100}
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Optional"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? "Save changes" : "Add panel"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
