"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

export function Toaster(props: ToasterProps) {
  const { theme = "system" } = useTheme();
  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-right"
      offset={20}
      gap={12}
      toastOptions={{
        classNames: {
          toast:
            "group toast pointer-events-auto !rounded-2xl !border !p-4 !gap-3 " +
            "group-[.toaster]:glass-strong group-[.toaster]:text-foreground " +
            "group-[.toaster]:border-border/60 group-[.toaster]:shadow-glow-lg " +
            "group-[.toaster]:backdrop-blur-2xl",
          title: "group-[.toast]:text-sm group-[.toast]:font-semibold",
          description: "group-[.toast]:text-xs group-[.toast]:text-muted-foreground group-[.toast]:mt-0.5",
          icon: "group-[.toast]:mr-1",
          actionButton:
            "group-[.toast]:!rounded-lg group-[.toast]:!bg-brand-gradient " +
            "group-[.toast]:!text-white group-[.toast]:!font-medium group-[.toast]:!px-3 " +
            "group-[.toast]:shadow-glow",
          cancelButton:
            "group-[.toast]:!rounded-lg group-[.toast]:!bg-secondary group-[.toast]:!text-secondary-foreground",
          // Left accent bar per type (via ring) + tinted icons.
          success:
            "group-[.toaster]:!border-success/40 [&_[data-icon]]:!text-success",
          error:
            "group-[.toaster]:!border-destructive/40 [&_[data-icon]]:!text-destructive",
          warning:
            "group-[.toaster]:!border-warning/40 [&_[data-icon]]:!text-warning",
          info: "group-[.toaster]:!border-primary/40 [&_[data-icon]]:!text-primary",
        },
      }}
      {...props}
    />
  );
}
