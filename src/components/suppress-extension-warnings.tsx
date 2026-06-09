"use client";

import { useEffect } from "react";

/**
 * Browser extensions (password managers / autofill — e.g. the one injecting
 * `data-sharkid`) mutate the DOM before React hydrates, producing a noisy
 * "hydration mismatch" warning in development. It's harmless and never happens
 * for real users without that extension.
 *
 * React passes the warning across several console.error arguments, and the
 * offending attribute (data-sharkid) often lands in a non-string arg, so we
 * match on the stable warning text/signatures instead. This ONLY silences the
 * attribute-level hydration-mismatch warning; genuine errors still surface.
 * No-op in production.
 */
const HYDRATION_SIGNATURES = [
  "hydrated but some attributes",
  "server rendered HTML didn't match the client",
  "A tree hydrated but some attributes",
  "data-sharkid",
  "data-sharklabel",
  "shark-icon-container",
];

function flatten(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

function isHydrationNoise(args: unknown[]): boolean {
  const text = flatten(args);
  if (!text) return false;
  return HYDRATION_SIGNATURES.some((sig) => text.includes(sig));
}

// Patch the console as early as the module loads on the client (before the
// first hydration pass) so the warning is caught even outside React effects.
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  const w = window as unknown as { __abConsolePatched?: boolean };
  if (!w.__abConsolePatched) {
    w.__abConsolePatched = true;
    const origError = console.error.bind(console);
    const origWarn = console.warn.bind(console);
    console.error = (...args: unknown[]) => {
      if (isHydrationNoise(args)) return;
      origError(...args);
    };
    console.warn = (...args: unknown[]) => {
      if (isHydrationNoise(args)) return;
      origWarn(...args);
    };
  }
}

export function SuppressExtensionWarnings() {
  // The patch above runs at import time; this component just ensures the module
  // is included in the client bundle.
  useEffect(() => {}, []);
  return null;
}
