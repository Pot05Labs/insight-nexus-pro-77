import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Layers,
  Target,
  ShoppingCart,
  BarChart3,
  Lightbulb,
  Users,
  Check,
  Eye,
  Zap,
  Package,
  Palette,
  TrendingUp,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/* ─── Capabilities Grid ─── */
const capabilities = [
  {
    icon: Layers,
    title: "Unified Performance Dashboard",
    description: "A single view across retailers and campaigns with daily reporting.",
  },
  {
    icon: Target,
    title: "Closed-Loop Attribution",
    description: "See the full funnel: scroll \u2192 PDP \u2192 add-to-cart \u2192 checkout, tied to outcomes.",
  },
  {
    icon: Package,
    title: "SKU-Level Measurement",
    description: "Understand which products — and which messages — are moving units.",
  },
  {
    icon: Palette,
    title: "Creative Performance Analysis",
    description: "Know what creative is driving action at the decision points.",
  },
  {
    icon: TrendingUp,
    title: "Optimisation Recommendations",
    description: "Turn performance signals into better pacing, targeting, and learnings.",
  },
  {
    icon: UserCheck,
    title: "First-Party Audience Layer",
    description: "Bank-verified, basket-based segments to sharpen targeting.",
  },
];

/* ─── How It Works Steps ─── */
const steps = [
  {
    num: "01",
    title: "Unify retailer data",
    description: "Bring performance signals from grocery retail partners into one reporting layer.",
    icon: Layers,
  },
  {
    num: "02",
    title: "Overlay campaign data",
    description: "Layer media inputs across channels on top of the retail outcomes — so reporting reflects the real customer journey.",
    icon: Zap,
  },
  {
    num: "03",
    title: "Output decision-ready intelligence",
    description: "Dashboards, attribution, and optimisation recommendations that improve results over time.",
    icon: Lightbulb,
  },
];

/* ─── Who It's For ─── */
const audiences = [
  {
    icon: ShoppingCart,
    title: "Brand Teams",
    description: "Prove retail media impact and optimise to sales outcomes.",
  },
  {
    icon: Users,
    title: "Agencies",
    description: "Standardise cross-retailer reporting and scale learnings across portfolios.",
  },
  {
    icon: BarChart3,
    title: "Retail Partners",
    description: "Package measurement into a repeatable reporting + insights layer.",
  },
];

/* ─── Trust Bullets ─── */
const trustBullets = [
  "Closed-loop journey visibility: scroll \u2192 PDP \u2192 cart \u2192 checkout",
  "SKU-level attribution + creative performance analysis",
  "Optional first-party audience layer: bank-verified + basket-based segments",
];

/* ─── Pain Points ─── */
const painPoints = [
  "No closed-loop connection between ads and checkout",
  "Siloed retailer reporting makes cross-retailer comparison difficult",
  "Targeting remains broad when it should be behaviour and basket-led",
];

const Landing = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("");
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const openDemo = () => {
    setSelectedPlan("Demo Request");
    setModalOpen(true);
  };

  const scrollToOutputs = () => {
    document.getElementById("capabilities")?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.from("waitlist_leads").insert({
      full_name: fullName.trim(),
      company_name: company.trim(),
      email: email.trim(),
      selected_plan: selectedPlan,
      message: message.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      toast({ title: "Something went wrong", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Thanks! We'll be in touch shortly." });
      setModalOpen(false);
      setFullName("");
      setCompany("");
      setEmail("");
      setMessage("");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* ═══ Nav ═══ */}
      <nav className="border-b border-border/60 backdrop-blur-sm sticky top-0 z-50 bg-background/90">
        <div className="container flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <BarChart3 className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-display text-base font-bold tracking-tight text-foreground">SignalStack</span>
              <span className="text-[10px] text-muted-foreground font-medium">by Pot Labs</span>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild>
              <Link to="/login">Sign in</Link>
            </Button>
            <Button onClick={openDemo}>
              Request a Demo <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </nav>

      {/* ═══ 1. Hero ═══ */}
      <section className="container py-24 lg:py-32">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-3xl mx-auto text-center"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-semibold mb-8 uppercase tracking-widest">
            Retail Signal Intelligence
          </div>
          <h1 className="font-display text-4xl lg:text-5xl font-extrabold tracking-tight mb-6 leading-[1.12]">
            Multi-retailer retail media intelligence — with campaign data{" "}
            <span className="text-primary">layered on top.</span>
          </h1>
          <p className="text-base text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed">
            SignalStack unifies retailer performance signals and overlays your campaign data to show what's really driving outcomes — from scroll &rarr; PDP &rarr; cart &rarr; checkout, down to SKU-level attribution.
          </p>

          {/* Trust Bullets */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-x-6 gap-y-2 mb-10 text-sm text-muted-foreground">
            {trustBullets.map((b) => (
              <div key={b} className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-left">{b}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center gap-4">
            <Button size="lg" onClick={openDemo} className="text-sm px-8 font-semibold">
              Request a Demo <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={scrollToOutputs} className="text-sm px-8">
              See Reporting Outputs
            </Button>
          </div>
        </motion.div>

        {/* Dashboard Preview */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="mt-20 max-w-5xl mx-auto"
        >
          <div className="rounded-xl border border-border bg-card shadow-xl overflow-hidden">
            <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border bg-muted/40">
              <div className="h-2.5 w-2.5 rounded-full bg-destructive/40" />
              <div className="h-2.5 w-2.5 rounded-full bg-warning/40" />
              <div className="h-2.5 w-2.5 rounded-full bg-success/40" />
              <span className="text-[11px] text-muted-foreground ml-3 font-medium">SignalStack — Retail Signal Intelligence</span>
            </div>
            <div className="p-6 grid grid-cols-4 gap-3">
              {[
                { label: "Revenue", value: "R2.4M", sub: "Across 4 retailers" },
                { label: "ROAS", value: "7.1x", sub: "Closed-loop" },
                { label: "iROAS", value: "4.3x", sub: "Incremental" },
                { label: "Units Sold", value: "142K", sub: "SKU-level" },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-border bg-background p-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1">{item.label}</p>
                  <p className="font-display text-xl font-bold">{item.value}</p>
                  <p className="text-xs mt-1 text-muted-foreground">{item.sub}</p>
                </div>
              ))}
              <div className="col-span-4 h-32 rounded-lg border border-border bg-muted/20 flex items-center justify-center gap-3">
                <div className="flex flex-col items-center gap-1">
                  <Eye className="h-5 w-5 text-muted-foreground/30" />
                  <span className="text-[10px] text-muted-foreground/40">Scroll</span>
                </div>
                <ArrowRight className="h-3 w-3 text-muted-foreground/20" />
                <div className="flex flex-col items-center gap-1">
                  <Package className="h-5 w-5 text-muted-foreground/30" />
                  <span className="text-[10px] text-muted-foreground/40">PDP</span>
                </div>
                <ArrowRight className="h-3 w-3 text-muted-foreground/20" />
                <div className="flex flex-col items-center gap-1">
                  <ShoppingCart className="h-5 w-5 text-muted-foreground/30" />
                  <span className="text-[10px] text-muted-foreground/40">Cart</span>
                </div>
                <ArrowRight className="h-3 w-3 text-muted-foreground/20" />
                <div className="flex flex-col items-center gap-1">
                  <Check className="h-5 w-5 text-primary/40" />
                  <span className="text-[10px] text-primary/50 font-medium">Checkout</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ═══ 2. Problem ═══ */}
      <section className="container py-24 border-t border-border/40">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
          >
            <h2 className="font-display text-3xl font-bold mb-4 text-center">
              Brands are spending in retail media — but can't see what's working across retailers.
            </h2>
            <p className="text-muted-foreground text-center mb-10 max-w-2xl mx-auto leading-relaxed">
              When retailer data sits in silos and campaign data lives elsewhere, teams end up optimising to proxy metrics. SignalStack closes the gap by connecting performance signals to decision points — so you can prove impact at checkout, not just on clicks.
            </p>
            <div className="grid sm:grid-cols-3 gap-4">
              {painPoints.map((pain, i) => (
                <motion.div
                  key={pain}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.08 }}
                  viewport={{ once: true }}
                  className="rounded-xl border border-destructive/20 bg-destructive/5 p-5"
                >
                  <p className="text-sm leading-relaxed">{pain}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══ 3. What SignalStack Is ═══ */}
      <section className="container py-24 border-t border-border/40">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
          >
            <h2 className="font-display text-3xl font-bold mb-4">
              SignalStack is the intelligence layer between retailer data and your campaign data.
            </h2>
            <p className="text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed">
              We ingest retail performance data, overlay campaign touchpoints, and return a single view of what's driving outcomes — plus the insights needed to improve performance over time through an always-on learning loop.
            </p>
            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-primary/30 bg-primary/5 text-primary font-semibold text-sm">
              Owning the signal, not the shelf.
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══ 4. How It Works ═══ */}
      <section className="container py-24 border-t border-border/40">
        <div className="text-center mb-16">
          <h2 className="font-display text-3xl font-bold mb-3">How it works</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Three steps from fragmented data to decision-ready intelligence.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {steps.map((s, i) => (
            <motion.div
              key={s.num}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              viewport={{ once: true }}
              className="rounded-xl border border-border bg-card p-8 text-center relative"
            >
              <div className="text-5xl font-display font-extrabold text-primary/10 mb-4">{s.num}</div>
              <div className="h-12 w-12 rounded-xl bg-primary/8 flex items-center justify-center mx-auto mb-4">
                <s.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-display font-semibold text-lg mb-2">{s.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{s.description}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ═══ 5. Capabilities Grid ═══ */}
      <section id="capabilities" className="container py-24 border-t border-border/40">
        <div className="text-center mb-16">
          <h2 className="font-display text-3xl font-bold mb-3">What you get</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            From unified dashboards to SKU-level attribution — everything needed to prove and improve retail media performance.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {capabilities.map((c, i) => (
            <motion.div
              key={c.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              viewport={{ once: true }}
              className="rounded-xl border border-border bg-card p-6 hover:shadow-md hover:border-primary/20 transition-all"
            >
              <div className="h-10 w-10 rounded-lg bg-primary/8 flex items-center justify-center mb-4">
                <c.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-display font-semibold text-base mb-2">{c.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{c.description}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ═══ 6. Who It's For ═══ */}
      <section className="container py-24 border-t border-border/40">
        <div className="text-center mb-16">
          <h2 className="font-display text-3xl font-bold mb-3">Who it's for</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {audiences.map((a, i) => (
            <motion.div
              key={a.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              viewport={{ once: true }}
              className="rounded-xl border border-border bg-card p-6 text-center"
            >
              <div className="h-12 w-12 rounded-xl bg-primary/8 flex items-center justify-center mx-auto mb-4">
                <a.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-display font-semibold text-base mb-2">{a.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{a.description}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ═══ 7. Final CTA ═══ */}
      <section className="container py-24">
        <div className="max-w-3xl mx-auto text-center rounded-2xl bg-primary p-12">
          <h2 className="font-display text-3xl font-bold text-primary-foreground mb-4">
            Turn retail signals into sales outcomes.
          </h2>
          <p className="text-primary-foreground/80 mb-8 max-w-xl mx-auto">
            See SignalStack on your brands and retailers — and get a recommended reporting + attribution setup.
          </p>
          <Button size="lg" variant="secondary" onClick={openDemo} className="text-sm px-8 font-semibold">
            Request a Demo <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* ═══ Footer ═══ */}
      <footer className="border-t border-border/40 py-8">
        <div className="container flex items-center justify-between text-sm text-muted-foreground">
          <div>
            <span>&copy; 2026 Pot Labs.</span>{" "}
            <span className="text-muted-foreground/60">A Pot Strategy company.</span>
          </div>
          <div className="flex gap-6">
            <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
            <a href="#" className="hover:text-foreground transition-colors">Terms</a>
            <a href="#" className="hover:text-foreground transition-colors">Contact</a>
          </div>
        </div>
      </footer>

      {/* ═══ Demo Request Modal ═══ */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Request a Demo</DialogTitle>
            <DialogDescription>Fill in your details and we'll set up a walkthrough of SignalStack on your data.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label htmlFor="wl-name">Full name</Label>
              <Input id="wl-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Smith" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wl-company">Company</Label>
              <Input id="wl-company" required value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Brand Co" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wl-email">Email</Label>
              <Input id="wl-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wl-msg">Tell us about your needs</Label>
              <Textarea id="wl-msg" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Which retailers and brands are you working with?" rows={3} />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Submitting..." : "Submit"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Landing;
