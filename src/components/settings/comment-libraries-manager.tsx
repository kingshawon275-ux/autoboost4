"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, MessageSquareText, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/fetcher";

interface LibRow {
  id: string;
  name: string;
  enabled: boolean;
  count: number;
}
interface LibFull extends LibRow {
  comments: string[];
}

export function CommentLibrariesManager() {
  const qc = useQueryClient();
  const { data: libs, isLoading } = useQuery({
    queryKey: ["comment-libraries"],
    queryFn: () => apiFetch<LibRow[]>("/api/comment-libraries"),
  });

  // Editor state: null = closed, "new" = creating, otherwise editing that id.
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [text, setText] = React.useState("");
  const [loadingFull, setLoadingFull] = React.useState(false);

  const lineCount = text.split("\n").map((l) => l.trim()).filter(Boolean).length;

  function openNew() {
    setEditingId("new");
    setName("");
    setText("");
  }

  async function openEdit(id: string) {
    setEditingId(id);
    setLoadingFull(true);
    try {
      const full = await apiFetch<LibFull>(`/api/comment-libraries/${id}`);
      setName(full.name);
      setText(full.comments.join("\n"));
    } catch (e) {
      toast.error((e as Error).message);
      setEditingId(null);
    } finally {
      setLoadingFull(false);
    }
  }

  const save = useMutation({
    mutationFn: () => {
      const body = JSON.stringify({ name: name.trim(), comments: text });
      return editingId === "new"
        ? apiFetch("/api/comment-libraries", { method: "POST", body })
        : apiFetch(`/api/comment-libraries/${editingId}`, { method: "PATCH", body });
    },
    onSuccess: () => {
      toast.success("Comment library saved");
      qc.invalidateQueries({ queryKey: ["comment-libraries"] });
      setEditingId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function remove(id: string, libName: string) {
    if (!confirm(`Delete comment library "${libName}"?`)) return;
    try {
      await apiFetch(`/api/comment-libraries/${id}`, { method: "DELETE" });
      qc.invalidateQueries({ queryKey: ["comment-libraries"] });
      toast.success("Deleted");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <MessageSquareText className="h-5 w-5 text-primary" /> Comment libraries
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a language and thousands of comments. Users pick a language in Auto Boost and a
            random set is sent based on the quantity.
          </p>
        </div>
        {editingId === null && (
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" /> New language
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {editingId !== null ? (
          <div className="space-y-3 rounded-xl border border-border bg-secondary/20 p-4">
            <div className="space-y-1.5">
              <Label>Language / name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Bangla, English, Spanish, Vietnamese"
                className="max-w-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Comments — one per line</Label>
              {loadingFull ? (
                <div className="flex h-40 items-center justify-center rounded-xl border border-border">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={12}
                  placeholder={"Comment 1\nComment 2\nComment 3\n..."}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-sm outline-none ring-primary/40 focus:ring-2"
                />
              )}
              <p className="text-xs text-muted-foreground">{lineCount.toLocaleString()} comment(s)</p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => save.mutate()}
                disabled={save.isPending || !name.trim() || lineCount === 0}
              >
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save
              </Button>
              <Button variant="outline" onClick={() => setEditingId(null)} disabled={save.isPending}>
                Cancel
              </Button>
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex h-20 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !libs?.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No comment libraries yet. Add one to get started.
          </p>
        ) : (
          <div className="space-y-2">
            {libs.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/20 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{l.name}</span>
                  <Badge variant="secondary">{l.count.toLocaleString()} comments</Badge>
                  {!l.enabled && <Badge variant="outline">disabled</Badge>}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(l.id)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => remove(l.id, l.name)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
