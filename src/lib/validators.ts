import { z } from "zod";

export const panelCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(80),
  apiUrl: z.string().url("Must be a valid URL"),
  apiKey: z.string().min(1, "API key is required"),
  currency: z.string().min(1).max(8).default("USD"),
  notes: z.string().max(500).optional().or(z.literal("")),
  priority: z.coerce.number().int().min(0).max(100).default(0),
});

export const panelUpdateSchema = panelCreateSchema.partial().extend({
  enabled: z.boolean().optional(),
});

const BOOST = z.enum([
  "LIKE",
  "SHARE",
  "LOVE",
  "WOW",
  "CARE",
  "HAHA",
  "ANGRY",
  "COMMENT",
  "FOLLOWERS",
  "VIEWS",
  "CUSTOM",
]);

// Each selected boost type carries its OWN quantity configuration.
export const boostConfigSchema = z
  .object({
    boostType: BOOST,
    quantityMode: z.enum(["fixed", "random"]),
    fixedQuantity: z.coerce.number().int().positive().optional(),
    minQuantity: z.coerce.number().int().positive().optional(),
    maxQuantity: z.coerce.number().int().positive().optional(),
    // Custom comments (one per line) — only used for COMMENT boosts. When set,
    // the order quantity is the number of comment lines.
    comments: z.string().optional(),
    // Or pull random comments from an admin comment library (by id). The order
    // quantity (fixed/random) decides how many are randomly picked.
    commentLibraryId: z.string().optional(),
  })
  .refine(
    (b) =>
      // COMMENT boosts with custom comments don't need a numeric quantity.
      (b.boostType === "COMMENT" && !!b.comments && b.comments.trim().length > 0) ||
      (b.quantityMode === "fixed"
        ? !!b.fixedQuantity
        : b.minQuantity != null && b.maxQuantity != null),
    { message: "Provide quantity values for the selected mode", path: ["fixedQuantity"] },
  )
  .refine(
    (b) =>
      b.quantityMode !== "random" ||
      (b.minQuantity != null && b.maxQuantity != null && b.maxQuantity >= b.minQuantity),
    { message: "Max must be greater than or equal to Min", path: ["maxQuantity"] },
  );

export type BoostConfig = z.infer<typeof boostConfigSchema>;

export const autoBoostSchema = z.object({
  postUrl: z.string().url("Enter a valid post URL"),
  platform: z.string().min(1).default("facebook"),
  boosts: z.array(boostConfigSchema).min(1, "Select at least one boost type"),
  panelIds: z.array(z.string().min(1)).min(1, "Select at least one panel"),
  // When true, each selected panel receives the FULL quantity (not split).
  // (Default behaviour now — kept explicit for clarity.)
  perPanelFull: z.boolean().default(true),
  // When true, manualQuantities is the authoritative per-panel plan: a panel
  // only orders the boosts listed for it (others are skipped).
  manualMode: z.boolean().default(false),
  // Optional manual override: per panel, per boost type quantity.
  // Shape: { [panelId]: { [boostType]: quantity } }. When present for a
  // panel+boost, it overrides the boost's own quantity for that panel.
  manualQuantities: z
    .record(z.string(), z.record(z.string(), z.coerce.number().int().nonnegative()))
    .optional(),
  dryRun: z.boolean().default(false),
});

export type AutoBoostInput = z.infer<typeof autoBoostSchema>;

// A saved Auto Boost preset (no postUrl — that changes every time).
export const presetSchema = z.object({
  name: z.string().min(1, "Name is required").max(60),
  platform: z.string().min(1).default("facebook"),
  panelIds: z.array(z.string().min(1)).min(1, "Select at least one panel"),
  boosts: z.array(boostConfigSchema).min(1, "Select at least one boost type"),
  // Manual per-panel config saved with the preset.
  manualMode: z.boolean().optional().default(false),
  manualQty: z.record(z.string(), z.record(z.string(), z.string())).optional(),
  panelBoosts: z.record(z.string(), z.record(z.string(), z.boolean())).optional(),
});

export type PresetInput = z.infer<typeof presetSchema>;

// Admin comment library (one language of comments).
export const commentLibrarySchema = z.object({
  name: z.string().min(1, "Name is required").max(40),
  // Accept the raw textarea text OR an array; normalize to clean lines.
  comments: z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : v.split("\n")))
    .transform((arr) => arr.map((l) => l.trim()).filter(Boolean)),
  enabled: z.boolean().optional().default(true),
});

export type CommentLibraryInput = z.infer<typeof commentLibrarySchema>;

export const serviceMappingSchema = z.object({
  boostType: BOOST,
  platform: z.string().min(1).default("facebook"),
  panelId: z.string().min(1),
  serviceId: z.string().min(1), // our Service document id
});
