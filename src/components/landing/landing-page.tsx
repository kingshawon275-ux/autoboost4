"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Zap,
  ThumbsUp,
  Share2,
  Heart,
  Eye,
  Users,
  MessageCircle,
  Rocket,
  ShieldCheck,
  Gauge,
  BarChart3,
  Layers,
  ArrowRight,
  Check,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const SERVICES = [
  { icon: ThumbsUp, label: "Likes", desc: "Boost post likes instantly" },
  { icon: Share2, label: "Shares", desc: "Grow reach with real shares" },
  { icon: Heart, label: "Reactions", desc: "Love, Wow, Haha & more" },
  { icon: MessageCircle, label: "Comments", desc: "Drive engagement & talk" },
  { icon: Users, label: "Followers", desc: "Build your audience fast" },
  { icon: Eye, label: "Views", desc: "Maximize video & reel views" },
];

const FEATURES = [
  { icon: Layers, title: "Multi-panel automation", desc: "Connect 10+ SMM panels and order from one dashboard." },
  { icon: Rocket, title: "Smart distribution", desc: "Orders auto-split across panels by cost, speed & reliability." },
  { icon: Gauge, title: "Real-time tracking", desc: "Live order status, balances and analytics — auto-synced." },
  { icon: ShieldCheck, title: "Secure & approved", desc: "Role-based access with admin-approved accounts." },
  { icon: BarChart3, title: "Powerful analytics", desc: "Spending, usage and panel performance at a glance." },
  { icon: Zap, title: "Saved presets", desc: "Save your favorite combos and reorder in one click." },
];

const PLANS = [
  {
    name: "Starter",
    price: "Pay as you go",
    tagline: "Perfect to get started",
    features: ["Single dashboard", "Like / Share / Views", "Order tracking", "Email support"],
    highlight: false,
  },
  {
    name: "Pro",
    price: "Best value",
    tagline: "For growing creators",
    features: ["Everything in Starter", "All reactions & comments", "Saved presets", "Priority routing", "Analytics"],
    highlight: true,
  },
  {
    name: "Business",
    price: "Custom",
    tagline: "For agencies & resellers",
    features: ["Everything in Pro", "Multi-panel scaling", "Bulk orders", "Dedicated support"],
    highlight: false,
  },
];

export function LandingPage({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient shadow-md shadow-primary/30">
              <Zap className="h-5 w-5 text-white" />
            </span>
            <span className="text-lg font-bold tracking-tight">
              Auto<span className="text-brand-gradient">Boost</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            <a href="#services" className="hover:text-foreground">Services</a>
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#pricing" className="hover:text-foreground">Pricing</a>
            <a href="#about" className="hover:text-foreground">About</a>
          </nav>
          <div className="flex items-center gap-2">
            {isLoggedIn ? (
              <Button asChild>
                <Link href="/dashboard">
                  Dashboard <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" asChild>
                  <Link href="/login">Login</Link>
                </Button>
                <Button asChild>
                  <Link href="/register">Get started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mesh-bg relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 py-24 text-center lg:px-8 lg:py-32">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-1.5 text-sm font-medium backdrop-blur">
              <Sparkle /> Premium SMM automation platform
            </span>
            <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Grow your social media with{" "}
              <span className="text-brand-gradient">one powerful dashboard</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              Connect multiple SMM panels and order likes, shares, reactions, followers and views —
              distributed intelligently, tracked in real time.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link href={isLoggedIn ? "/dashboard" : "/register"}>
                  {isLoggedIn ? "Go to dashboard" : "Create free account"}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <a href="#services">Explore services</a>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Services */}
      <Section id="services" title="Services we offer" subtitle="Every engagement type you need, in one place.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="glass group rounded-2xl p-6 transition-shadow hover:shadow-lg"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-gradient shadow-md shadow-primary/30">
                <s.icon className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold">{s.label}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* Features */}
      <Section id="features" title="Why AutoBoost" subtitle="Built like a premium SaaS — fast, reliable, automated." muted>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="rounded-2xl border border-border bg-card p-6"
            >
              <f.icon className="h-7 w-7 text-primary" />
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* Pricing */}
      <Section id="pricing" title="Simple pricing" subtitle="Start free. Scale as you grow.">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={
                "relative rounded-2xl border p-6 " +
                (p.highlight
                  ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20 shadow-lg"
                  : "border-border bg-card")
              }
            >
              {p.highlight && (
                <span className="absolute -top-3 left-6 rounded-full bg-brand-gradient px-3 py-1 text-xs font-semibold text-white">
                  Most popular
                </span>
              )}
              <h3 className="text-lg font-semibold">{p.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{p.tagline}</p>
              <p className="mt-4 text-2xl font-bold">{p.price}</p>
              <ul className="mt-6 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-success" /> {f}
                  </li>
                ))}
              </ul>
              <Button className="mt-6 w-full" variant={p.highlight ? "default" : "outline"} asChild>
                <Link href={isLoggedIn ? "/dashboard" : "/register"}>Get started</Link>
              </Button>
            </div>
          ))}
        </div>
      </Section>

      {/* About / CTA */}
      <Section id="about" title="About AutoBoost" subtitle="" muted>
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-muted-foreground">
            AutoBoost is a centralized SMM management platform that lets you connect multiple panel
            APIs and create social media engagement orders from a single, beautiful dashboard. We
            handle intelligent order distribution, real-time tracking and analytics so you can focus
            on growth. New accounts are reviewed and approved by our team to keep the platform safe.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link href={isLoggedIn ? "/dashboard" : "/register"}>
                {isLoggedIn ? "Open dashboard" : "Get started now"} <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="mailto:support@autoboost.dev">
                <Mail className="h-4 w-4" /> Contact us
              </a>
            </Button>
          </div>
        </div>
      </Section>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 text-sm text-muted-foreground sm:flex-row lg:px-8">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <span>© {new Date().getFullYear()} AutoBoost. All rights reserved.</span>
          </div>
          <div className="flex gap-4">
            <Link href="/login" className="hover:text-foreground">Login</Link>
            <Link href="/register" className="hover:text-foreground">Register</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Section({
  id,
  title,
  subtitle,
  children,
  muted,
}: {
  id: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <section id={id} className={muted ? "bg-secondary/30" : ""}>
      <div className="mx-auto max-w-7xl px-4 py-20 lg:px-8">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
          {subtitle && <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">{subtitle}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

function Sparkle() {
  return <Zap className="h-3.5 w-3.5 text-primary" />;
}
