import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number as a compact currency string. */
export function formatCurrency(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Compact number formatting: 1.2k, 3.4M. */
export function formatCompact(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

// Bangladesh timezone (GMT+6).
const BD_TZ = "Asia/Dhaka";

/** Full date + time in Bangladesh time, e.g. "07 Jun 2026, 9:30 PM". */
export function formatDateTimeBD(date: Date | string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: BD_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(date));
}

/** Date only in Bangladesh time, e.g. "07 Jun 2026". */
export function formatDateBD(date: Date | string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: BD_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export function formatDate(date: Date | string) {
  return formatDateTimeBD(date);
}

export function relativeTime(date: Date | string) {
  const d = new Date(date).getTime();
  const diff = Date.now() - d;
  const sec = Math.round(diff / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);
  if (sec < 60) return "just now";
  if (min < 60) return `${min}m ago`;
  if (hr < 24) return `${hr}h ago`;
  return `${day}d ago`;
}

/** Inclusive random integer in [min, max]. */
export function randomInt(min: number, max: number) {
  const lo = Math.ceil(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}
