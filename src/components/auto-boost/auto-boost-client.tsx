"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Rocket,
  Sparkles,
  Loader2,
  Server,
  AlertTriangle,
  Wand2,
  Save,
  Bookmark,
  Trash2,
  Star,
  Check,
  Share2,
  Download,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/fetcher";
import { cn, formatCurrency } from "@/lib/utils";
import { useCurrency } from "@/components/currency-provider";
import { BOOST_TYPES, PLATFORMS } from "@/lib/constants";

interface PanelOption {
  id: string;
  name: string;
  balance: number;
  currency: string;
  status: string;
  responseMs: number;
  mappings: { boostType: string; platform: string }[];
}

interface PlanItem {
  boostType: string;
  quantity: number;
  allocations: { panelName: string; quantity: number; estCost: number }[];
  totalCost: number;
  warnings: string[];
}
interface Plan {
  totalCost: number;
  warnings: string[];
  items: PlanItem[];
}

// Per-boost quantity configuration kept in UI state.
interface BoostCfg {
  mode: "fixed" | "random";
  fixed: string;
  min: string;
  max: string;
  comments?: string; // custom comments (one per line) — COMMENT boost only
  commentLibraryId?: string; // pull random comments from this admin library
}
const DEFAULT_CFG: BoostCfg = { mode: "fixed", fixed: "1000", min: "30", max: "35" };

interface SavedBoost {
  boostType: string;
  quantityMode: "fixed" | "random";
  fixedQuantity?: number;
  minQuantity?: number;
  maxQuantity?: number;
  comments?: string;
  commentLibraryId?: string;
}
interface Preset {
  id: string;
  name: string;
  platform: string;
  panelIds: string[];
  boosts: SavedBoost[];
  isDefault: boolean;
  shareCode?: string | null;
  manualMode?: boolean;
  manualQty?: Record<string, Record<string, string>> | null;
  panelBoosts?: Record<string, Record<string, boolean>> | null;
}

export function AutoBoostClient() {
  const router = useRouter();
  const qc = useQueryClient();
  const { format: fmtMoney } = useCurrency();
  const [platform, setPlatform] = React.useState("facebook");
  const [postUrl, setPostUrl] = React.useState("");
  // Map of boostType -> its own quantity config. Presence = selected.
  const [boostConfigs, setBoostConfigs] = React.useState<Record<string, BoostCfg>>({
    LIKE: { ...DEFAULT_CFG },
  });
  const [selectedPanels, setSelectedPanels] = React.useState<string[]>([]);
  // Manual per-panel quantity override. When off, each panel gets the full
  // boost quantity. Shape: manualQty[panelId][boostType] = "123"
  const [manualMode, setManualMode] = React.useState(false);
  const [manualQty, setManualQty] = React.useState<Record<string, Record<string, string>>>({});
  // Which boosts are enabled for each panel in manual mode.
  // Shape: panelBoosts[panelId] = Set<boostType>. Absent panel => all on.
  const [panelBoosts, setPanelBoosts] = React.useState<Record<string, Record<string, boolean>>>({});
  const [plan, setPlan] = React.useState<Plan | null>(null);
  const [planning, setPlanning] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [presetName, setPresetName] = React.useState("");
  const [savingPreset, setSavingPreset] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [importCode, setImportCode] = React.useState("");
  const [importing, setImporting] = React.useState(false);
  // Auto-redirect to Orders after creating — persisted per browser. Default on.
  const [autoRedirect, setAutoRedirect] = React.useState(true);
  React.useEffect(() => {
    const saved = localStorage.getItem("autoboost_redirect");
    if (saved !== null) setAutoRedirect(saved === "1");
  }, []);
  function toggleAutoRedirect(v: boolean) {
    setAutoRedirect(v);
    localStorage.setItem("autoboost_redirect", v ? "1" : "0");
  }

  const { data: panels, isLoading } = useQuery({
    queryKey: ["panel-options"],
    queryFn: () => apiFetch<PanelOption[]>("/api/panels/options"),
  });

  const { data: presets } = useQuery({
    queryKey: ["presets"],
    queryFn: () => apiFetch<Preset[]>("/api/presets"),
  });

  const { data: commentLibraries } = useQuery({
    queryKey: ["comment-libraries"],
    queryFn: () =>
      apiFetch<{ id: string; name: string; enabled: boolean; count: number }[]>(
        "/api/comment-libraries",
      ),
  });

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiFetch<{ quickQuantities: number[] }>("/api/settings"),
  });
  const quickQuantities = settings?.quickQuantities?.length
    ? settings.quickQuantities
    : [500, 1000, 5000, 10000];

  const selectedBoosts = Object.keys(boostConfigs);

  // Load a saved preset into the form (postUrl stays untouched).
  const applyPreset = React.useCallback((p: Preset) => {
    setPlatform(p.platform);
    setSelectedPanels(p.panelIds);
    const cfgs: Record<string, BoostCfg> = {};
    for (const b of p.boosts) {
      cfgs[b.boostType] = {
        mode: b.quantityMode,
        fixed: String(b.fixedQuantity ?? 1000),
        min: String(b.minQuantity ?? 30),
        max: String(b.maxQuantity ?? 35),
        comments: b.comments ?? undefined,
        commentLibraryId: b.commentLibraryId ?? undefined,
      };
    }
    setBoostConfigs(cfgs);
    // Restore manual per-panel config if the preset has it.
    setManualMode(!!p.manualMode);
    setManualQty(p.manualQty ?? {});
    setPanelBoosts(p.panelBoosts ?? {});
    setPlan(null);
  }, []);

  function loadPreset(p: Preset) {
    applyPreset(p);
    toast.success(`Loaded preset "${p.name}"`);
  }

  // Auto-load the default preset once when the page first opens.
  const autoLoadedRef = React.useRef(false);
  const [loadedDefaultName, setLoadedDefaultName] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (autoLoadedRef.current || !presets?.length) return;
    const def = presets.find((p) => p.isDefault);
    if (def) {
      autoLoadedRef.current = true;
      applyPreset(def);
      setLoadedDefaultName(def.name);
      toast.success(`Default preset "${def.name}" loaded`);
    }
  }, [presets, applyPreset]);

  async function toggleDefault(p: Preset) {
    try {
      await apiFetch(`/api/presets/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isDefault: !p.isDefault }),
      });
      qc.invalidateQueries({ queryKey: ["presets"] });
      toast.success(p.isDefault ? "Removed default" : `"${p.name}" is now the default`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function savePreset() {
    if (!presetName.trim()) return toast.error("Enter a preset name");
    if (!selectedBoosts.length) return toast.error("Select at least one boost type");
    if (!selectedPanels.length) return toast.error("Select at least one panel");
    setSavingPreset(true);
    try {
      await apiFetch("/api/presets", {
        method: "POST",
        body: JSON.stringify({
          name: presetName.trim(),
          platform,
          panelIds: selectedPanels,
          boosts: Object.entries(boostConfigs).map(([boostType, c]) => ({
            boostType,
            quantityMode: c.mode,
            fixedQuantity: c.mode === "fixed" ? Number(c.fixed) : undefined,
            minQuantity: c.mode === "random" ? Number(c.min) : undefined,
            maxQuantity: c.mode === "random" ? Number(c.max) : undefined,
            comments: boostType === "COMMENT" && c.comments?.trim() ? c.comments : undefined,
            commentLibraryId:
              boostType === "COMMENT" && c.commentLibraryId ? c.commentLibraryId : undefined,
          })),
          manualMode,
          manualQty: manualMode ? manualQty : undefined,
          panelBoosts: manualMode ? panelBoosts : undefined,
        }),
      });
      toast.success("Preset saved");
      setSaveOpen(false);
      setPresetName("");
      qc.invalidateQueries({ queryKey: ["presets"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingPreset(false);
    }
  }

  async function deletePreset(id: string, name: string) {
    if (!confirm(`Delete preset "${name}"?`)) return;
    try {
      await apiFetch(`/api/presets/${id}`, { method: "DELETE" });
      qc.invalidateQueries({ queryKey: ["presets"] });
      toast.success("Preset deleted");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // Generate a share code and copy it to the clipboard.
  async function sharePreset(p: Preset) {
    try {
      const res = await apiFetch<{ shareCode: string }>(`/api/presets/${p.id}/share`, {
        method: "POST",
      });
      await navigator.clipboard.writeText(res.shareCode).catch(() => {});
      qc.invalidateQueries({ queryKey: ["presets"] });
      toast.success(`Share code copied: ${res.shareCode}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // Import a preset shared by another user.
  async function importPreset() {
    if (!importCode.trim()) return toast.error("Enter a share code");
    setImporting(true);
    try {
      const res = await apiFetch<{ name: string }>("/api/presets/import", {
        method: "POST",
        body: JSON.stringify({ code: importCode.trim() }),
      });
      qc.invalidateQueries({ queryKey: ["presets"] });
      toast.success(`Imported "${res.name}"`);
      setImportOpen(false);
      setImportCode("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  function toggleBoost(v: string) {
    setBoostConfigs((s) => {
      const next = { ...s };
      if (next[v]) delete next[v];
      else next[v] = { ...DEFAULT_CFG };
      return next;
    });
    setPlan(null);
  }

  function updateBoost(v: string, patch: Partial<BoostCfg>) {
    setBoostConfigs((s) => ({ ...s, [v]: { ...s[v], ...patch } }));
    setPlan(null);
  }

  function togglePanel(id: string) {
    setSelectedPanels((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    setPlan(null);
  }

  // In manual mode, a boost is ON for a panel unless explicitly turned off.
  function isBoostOn(panelId: string, boostType: string) {
    const rec = panelBoosts[panelId];
    if (!rec || rec[boostType] === undefined) return true; // default on
    return rec[boostType];
  }
  function toggleBoostForPanel(panelId: string, boostType: string) {
    setPanelBoosts((s) => ({
      ...s,
      [panelId]: { ...s[panelId], [boostType]: !isBoostOn(panelId, boostType) },
    }));
    setPlan(null);
  }

  function buildPayload(dryRun: boolean) {
    // Manual mode: send ONLY the boosts the admin enabled per panel, with the
    // entered quantity. When manualQuantities is present, the backend treats it
    // as the complete per-panel plan (anything not listed = not ordered).
    let manualQuantities: Record<string, Record<string, number>> | undefined;
    if (manualMode) {
      manualQuantities = {};
      for (const pid of selectedPanels) {
        const perBoost: Record<string, number> = {};
        for (const boostType of selectedBoosts) {
          if (!isBoostOn(pid, boostType)) continue; // unchecked → skip
          const v = Number(manualQty[pid]?.[boostType]);
          if (v > 0) perBoost[boostType] = v;
        }
        // Always include the panel key (even if empty) so backend knows manual
        // mode is authoritative for it.
        manualQuantities[pid] = perBoost;
      }
    }
    return {
      postUrl,
      platform,
      panelIds: selectedPanels,
      perPanelFull: true,
      manualMode,
      manualQuantities,
      boosts: Object.entries(boostConfigs).map(([boostType, c]) => ({
        boostType,
        quantityMode: c.mode,
        fixedQuantity: c.mode === "fixed" ? Number(c.fixed) : undefined,
        minQuantity: c.mode === "random" ? Number(c.min) : undefined,
        maxQuantity: c.mode === "random" ? Number(c.max) : undefined,
        comments: boostType === "COMMENT" && c.comments?.trim() ? c.comments : undefined,
        commentLibraryId:
          boostType === "COMMENT" && c.commentLibraryId ? c.commentLibraryId : undefined,
      })),
      dryRun,
    };
  }

  function validate(): string | null {
    if (!postUrl.trim()) return "Enter a post URL";
    if (!selectedBoosts.length) return "Select at least one boost type";
    if (!selectedPanels.length) return "Select at least one panel";
    for (const [type, c] of Object.entries(boostConfigs)) {
      const label = BOOST_TYPES.find((b) => b.value === type)?.label ?? type;
      if (c.mode === "fixed" && Number(c.fixed) <= 0)
        return `Enter a valid quantity for ${label}`;
      if (c.mode === "random") {
        if (Number(c.min) <= 0 || Number(c.max) <= 0)
          return `Enter Min/Max for ${label}`;
        if (Number(c.max) < Number(c.min)) return `Max must be ≥ Min for ${label}`;
      }
    }
    return null;
  }

  async function handlePreview() {
    const err = validate();
    if (err) return toast.error(err);
    setPlanning(true);
    setPlan(null);
    try {
      const res = await apiFetch<{ plan: Plan }>("/api/orders", {
        method: "POST",
        body: JSON.stringify(buildPayload(true)),
      });
      setPlan(res.plan);
      if (res.plan.warnings.length) toast.warning(res.plan.warnings[0]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPlanning(false);
    }
  }

  async function handleSubmit() {
    const err = validate();
    if (err) return toast.error(err);
    setSubmitting(true);
    try {
      const res = await apiFetch<{ orders: unknown[]; totalCost: number }>("/api/orders", {
        method: "POST",
        body: JSON.stringify(buildPayload(false)),
      });
      toast.success(
        `Created ${res.orders.length} order(s) · ${fmtMoney(res.totalCost)} spent`,
      );
      if (autoRedirect) {
        router.push("/orders");
        router.refresh();
      } else {
        // Stay on the page; reset the plan and let the admin order again.
        setPlan(null);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Auto Boost"
        description="Create engagement orders and distribute them intelligently across your panels."
      >
        {loadedDefaultName && (
          <Badge variant="success" className="gap-1.5">
            <Star className="h-3.5 w-3.5 fill-current" /> {loadedDefaultName}
          </Badge>
        )}
        <Button variant="outline" onClick={() => setSaveOpen(true)}>
          <Save className="h-4 w-4" /> Save preset
        </Button>
        <Badge variant="default" className="gap-1.5">
          <Sparkles className="h-3.5 w-3.5" /> Smart distribution
        </Badge>
      </PageHeader>

      {/* Saved presets — one click to load panels + boosts + quantities */}
      {!!presets?.length && (
        <Card className="mb-6">
          <CardContent className="flex flex-wrap items-center gap-2 py-4">
            <span className="mr-1 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <Bookmark className="h-4 w-4" /> Saved presets:
            </span>
            {presets.map((p) => (
              <div
                key={p.id}
                className={cn(
                  "group flex items-center gap-1 rounded-full border py-1 pl-2 pr-1 text-sm transition-colors",
                  p.isDefault
                    ? "border-primary/50 bg-primary/10"
                    : "border-border bg-secondary/40 hover:border-primary/40 hover:bg-primary/10",
                )}
              >
                <button
                  type="button"
                  onClick={() => toggleDefault(p)}
                  className={cn(
                    "rounded-full p-1 transition-colors",
                    p.isDefault
                      ? "text-warning"
                      : "text-muted-foreground hover:text-warning",
                  )}
                  title={p.isDefault ? "Default — click to unset" : "Set as default"}
                >
                  <Star className={cn("h-3.5 w-3.5", p.isDefault && "fill-current")} />
                </button>
                <button
                  type="button"
                  onClick={() => loadPreset(p)}
                  className="font-medium"
                  title={`Load "${p.name}"`}
                >
                  {p.name}
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {p.boosts.length} boost · {p.panelIds.length} panel
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => sharePreset(p)}
                  className="rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:text-primary group-hover:opacity-100"
                  title="Share preset (copy code)"
                >
                  <Share2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => deletePreset(p.id, p.name)}
                  className="rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  title="Delete preset"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            {/* Import a shared preset */}
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              <Download className="h-3.5 w-3.5" /> Import
            </button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: configuration */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Target</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[160px_1fr]">
                <div className="space-y-2">
                  <Label>Platform</Label>
                  <Select
                    value={platform}
                    onValueChange={(v) => {
                      setPlatform(v);
                      setPlan(null);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLATFORMS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="url">Post URL</Label>
                  <Input
                    id="url"
                    value={postUrl}
                    onChange={(e) => {
                      setPostUrl(e.target.value);
                      setPlan(null);
                    }}
                    placeholder="https://facebook.com/post/123…"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Boost types & quantity</CardTitle>
              <p className="text-sm text-muted-foreground">
                Select boost types — each gets its own quantity. e.g. Like 1000 + Share 500 + Love 200.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {BOOST_TYPES.map((b) => {
                  const active = !!boostConfigs[b.value];
                  return (
                    <button
                      key={b.value}
                      type="button"
                      onClick={() => toggleBoost(b.value)}
                      className={cn(
                        "flex items-center gap-2 rounded-xl border p-3 text-left text-sm transition-all",
                        active
                          ? "border-primary/40 bg-primary/10 ring-1 ring-primary/30"
                          : "border-border hover:bg-secondary/50",
                      )}
                    >
                      <span className="text-lg">{b.emoji}</span>
                      <span className="font-medium">{b.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Per-boost quantity controls */}
              <div className="space-y-3 pt-1">
                <AnimatePresence initial={false}>
                  {BOOST_TYPES.filter((b) => boostConfigs[b.value]).map((b) => {
                    const cfg = boostConfigs[b.value];
                    return (
                      <motion.div
                        key={b.value}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden rounded-xl border border-border bg-secondary/20"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3 p-3">
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            <span className="text-lg">{b.emoji}</span> {b.label}
                          </div>
                          {b.value !== "COMMENT" && (
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Wand2 className="h-3.5 w-3.5 text-primary" /> Random
                              <Switch
                                checked={cfg.mode === "random"}
                                onCheckedChange={(c) =>
                                  updateBoost(b.value, { mode: c ? "random" : "fixed" })
                                }
                              />
                            </label>
                          )}
                        </div>

                        <div className="px-3 pb-3">
                          {b.value === "COMMENT" ? (
                            <div className="space-y-3">
                              {/* Language libraries — pick one to send random comments */}
                              <div className="space-y-1.5">
                                <Label className="text-xs">Comment language (random from library)</Label>
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateBoost(b.value, { commentLibraryId: undefined })
                                    }
                                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                                      !cfg.commentLibraryId
                                        ? "border-primary bg-primary/15 text-primary"
                                        : "border-border text-muted-foreground hover:border-primary/50"
                                    }`}
                                  >
                                    None
                                  </button>
                                  {(commentLibraries ?? [])
                                    .filter((lib) => lib.enabled && lib.count > 0)
                                    .map((lib) => (
                                      <button
                                        key={lib.id}
                                        type="button"
                                        onClick={() =>
                                          updateBoost(b.value, {
                                            commentLibraryId: lib.id,
                                            mode: "fixed",
                                          })
                                        }
                                        className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                                          cfg.commentLibraryId === lib.id
                                            ? "border-primary bg-primary/15 text-primary"
                                            : "border-border text-muted-foreground hover:border-primary/50"
                                        }`}
                                      >
                                        {lib.name}{" "}
                                        <span className="opacity-60">({lib.count.toLocaleString()})</span>
                                      </button>
                                    ))}
                                  {!commentLibraries?.length && (
                                    <span className="text-xs text-muted-foreground">
                                      No libraries yet — admin can add them in Settings.
                                    </span>
                                  )}
                                </div>
                              </div>

                              {cfg.commentLibraryId ? (
                                // Library selected → just need a quantity.
                                <div className="space-y-2">
                                  <Label className="text-xs">How many comments?</Label>
                                  <Input
                                    type="number"
                                    min={1}
                                    value={cfg.fixed}
                                    placeholder="Quantity"
                                    onChange={(e) => updateBoost(b.value, { fixed: e.target.value })}
                                  />
                                  <div className="flex flex-wrap gap-2">
                                    {quickQuantities.map((q) => (
                                      <Button
                                        key={q}
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => updateBoost(b.value, { fixed: String(q) })}
                                      >
                                        {q.toLocaleString()}
                                      </Button>
                                    ))}
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {Number(cfg.fixed) > 0
                                      ? `${Number(cfg.fixed).toLocaleString()} random comments will be picked from this language.`
                                      : "Enter how many comments to send."}
                                  </p>
                                </div>
                              ) : (
                                // No library → type your own custom comments (optional).
                                <div className="space-y-2">
                                  <Label className="text-xs">Or type custom comments — one per line</Label>
                                  <textarea
                                    value={cfg.comments ?? ""}
                                    onChange={(e) =>
                                      updateBoost(b.value, { comments: e.target.value })
                                    }
                                    rows={5}
                                    placeholder={"Nice post! 🔥\nLove this\nAmazing content"}
                                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/40 focus:ring-2"
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    {(() => {
                                      const n = (cfg.comments ?? "")
                                        .split("\n")
                                        .map((l) => l.trim())
                                        .filter(Boolean).length;
                                      return n > 0
                                        ? `${n} comment${n > 1 ? "s" : ""} — quantity will be ${n}.`
                                        : "Leave empty to use a normal quantity (random comments from the panel).";
                                    })()}
                                  </p>
                                </div>
                              )}
                            </div>
                          ) : cfg.mode === "fixed" ? (
                            <div className="space-y-2">
                              <Input
                                type="number"
                                min={1}
                                value={cfg.fixed}
                                placeholder="Quantity"
                                onChange={(e) => updateBoost(b.value, { fixed: e.target.value })}
                              />
                              <div className="flex flex-wrap gap-2">
                                {quickQuantities.map((q) => (
                                  <Button
                                    key={q}
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => updateBoost(b.value, { fixed: String(q) })}
                                  >
                                    {q.toLocaleString()}
                                  </Button>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1.5">
                                <Label className="text-xs">Min</Label>
                                <Input
                                  type="number"
                                  min={1}
                                  value={cfg.min}
                                  onChange={(e) => updateBoost(b.value, { min: e.target.value })}
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs">Max</Label>
                                <Input
                                  type="number"
                                  min={1}
                                  value={cfg.max}
                                  onChange={(e) => updateBoost(b.value, { max: e.target.value })}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Panels</CardTitle>
              <p className="text-sm text-muted-foreground">
                Each selected panel gets the full quantity. e.g. 20 likes × 2 panels = 20 to each.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Manual per-panel quantity toggle */}
              <div className="flex items-center gap-3 rounded-xl border border-border p-3">
                <Wand2 className="h-4 w-4 text-primary" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Manual quantity per panel</p>
                  <p className="text-xs text-muted-foreground">
                    Set a different quantity for each panel.
                  </p>
                </div>
                <Switch
                  checked={manualMode}
                  onCheckedChange={(c) => {
                    setManualMode(c);
                    setPlan(null);
                  }}
                />
              </div>

              {isLoading ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Loading panels…</p>
              ) : !panels?.length ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No enabled panels. Add one on the Panels page.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2.5">
                  {panels.map((p) => {
                    const active = selectedPanels.includes(p.id);
                    return (
                      <div
                        key={p.id}
                        className={cn(
                          "rounded-xl border transition-all",
                          active
                            ? "border-primary/40 bg-primary/10 ring-1 ring-primary/30"
                            : "border-border hover:bg-secondary/50",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => togglePanel(p.id)}
                          className="flex w-full items-center gap-3 p-3 text-left"
                        >
                          <span
                            className={cn(
                              "flex h-9 w-9 items-center justify-center rounded-lg",
                              active ? "bg-brand-gradient text-white" : "bg-secondary text-muted-foreground",
                            )}
                          >
                            <Server className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-semibold">{p.name}</span>
                              <span
                                className={cn(
                                  "h-2 w-2 rounded-full",
                                  p.status === "ONLINE" ? "bg-success" : "bg-muted-foreground",
                                )}
                              />
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatCurrency(p.balance, p.currency)} ·{" "}
                              {p.responseMs ? `${p.responseMs}ms` : "—"} · {p.mappings.length} mapped
                            </div>
                          </div>
                          {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
                        </button>

                        {/* Per-boost selection + quantity for this panel (manual mode) */}
                        {active && manualMode && selectedBoosts.length > 0 && (
                          <div className="space-y-2 border-t border-border/50 bg-background/30 p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Choose what {p.name} delivers
                            </p>
                            <div className="space-y-2">
                              {selectedBoosts.map((bt) => {
                                const meta = BOOST_TYPES.find((b) => b.value === bt);
                                const on = isBoostOn(p.id, bt);
                                return (
                                  <div
                                    key={bt}
                                    className={cn(
                                      "flex items-center gap-3 rounded-xl border p-2 pl-3 transition-all",
                                      on
                                        ? "border-primary/40 bg-primary/5"
                                        : "border-border/60 opacity-70",
                                    )}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => toggleBoostForPanel(p.id, bt)}
                                      className="flex flex-1 items-center gap-2 text-left"
                                    >
                                      <span
                                        className={cn(
                                          "flex h-5 w-5 items-center justify-center rounded-md border transition-colors",
                                          on
                                            ? "border-primary bg-primary text-white"
                                            : "border-muted-foreground/40",
                                        )}
                                      >
                                        {on && <Check className="h-3.5 w-3.5" />}
                                      </span>
                                      <span className="text-base">{meta?.emoji}</span>
                                      <span className="text-sm font-medium">{meta?.label ?? bt}</span>
                                    </button>
                                    <Input
                                      type="number"
                                      min={1}
                                      disabled={!on}
                                      className="h-9 w-28 disabled:opacity-40"
                                      placeholder="qty"
                                      value={manualQty[p.id]?.[bt] ?? ""}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        setManualQty((s) => ({
                                          ...s,
                                          [p.id]: { ...s[p.id], [bt]: v },
                                        }));
                                        setPlan(null);
                                      }}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: plan / submit */}
        <div className="lg:col-span-1">
          <div className="sticky top-20 space-y-4">
            <Card className="ring-brand">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Rocket className="h-5 w-5 text-primary" /> Distribution plan
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={handlePreview}
                  disabled={planning}
                >
                  {planning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Preview distribution
                </Button>

                <AnimatePresence mode="wait">
                  {plan && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-3 overflow-hidden"
                    >
                      {plan.items.map((item) => (
                        <div key={item.boostType} className="rounded-lg border border-border p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-sm font-semibold">
                              {BOOST_TYPES.find((b) => b.value === item.boostType)?.emoji}{" "}
                              {item.boostType}
                            </span>
                            <Badge variant="secondary">{item.quantity.toLocaleString()}</Badge>
                          </div>
                          {item.allocations.length ? (
                            <div className="space-y-1">
                              {item.allocations.map((a, i) => (
                                <div
                                  key={i}
                                  className="flex items-center justify-between text-xs text-muted-foreground"
                                >
                                  <span className="truncate">{a.panelName}</span>
                                  <span className="tabular-nums">
                                    {a.quantity.toLocaleString()} · {fmtMoney(a.estCost)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="flex items-center gap-1 text-xs text-warning">
                              <AlertTriangle className="h-3 w-3" /> {item.warnings[0] || "No allocation"}
                            </p>
                          )}
                        </div>
                      ))}

                      <div className="flex items-center justify-between border-t border-border pt-3">
                        <span className="text-sm text-muted-foreground">Estimated cost</span>
                        <span className="text-lg font-bold">{fmtMoney(plan.totalCost)}</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">Go to Orders after creating</p>
                    <p className="text-xs text-muted-foreground">
                      {autoRedirect ? "Will open Order Status" : "Stay on this page"}
                    </p>
                  </div>
                  <Switch checked={autoRedirect} onCheckedChange={toggleAutoRedirect} />
                </div>

                <Button className="w-full" size="lg" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                  {submitting ? "Creating orders…" : "Create orders"}
                </Button>
                <Button variant="outline" className="w-full" onClick={() => setSaveOpen(true)}>
                  <Save className="h-4 w-4" /> Save as preset
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Orders are submitted to providers and tracked on the Orders page.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Save preset dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save preset</DialogTitle>
            <DialogDescription>
              Save the selected panels, boost types and quantities. Load it later in one click —
              you only enter the post URL each time.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="preset-name">Preset name</Label>
              <Input
                id="preset-name"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="e.g. FB Likes + Shares combo"
                onKeyDown={(e) => {
                  if (e.key === "Enter") savePreset();
                }}
              />
            </div>
            <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
              Saving{" "}
              <span className="font-medium text-foreground">{selectedBoosts.length}</span> boost type(s)
              and <span className="font-medium text-foreground">{selectedPanels.length}</span> panel(s).
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={savePreset} disabled={savingPreset}>
              {savingPreset ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import preset dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import a shared preset</DialogTitle>
            <DialogDescription>
              Paste a share code someone gave you. A private copy is added to your presets.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="import-code">Share code</Label>
            <Input
              id="import-code"
              value={importCode}
              onChange={(e) => setImportCode(e.target.value.toUpperCase())}
              placeholder="e.g. A1B2C3D4"
              className="font-mono tracking-widest"
              onKeyDown={(e) => {
                if (e.key === "Enter") importPreset();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button onClick={importPreset} disabled={importing}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
