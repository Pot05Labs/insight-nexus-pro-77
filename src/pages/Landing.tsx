import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Zap, Shield, Users, Brain, Upload, BarChart3, MessageSquare, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const features = [
  {
    icon: Upload,
    title: "Multi-Source Ingestion",
    description: "CSV, XLSX, PPTX, PDF, Google Sheets — drag, drop, harmonised.",
  },
  {
    icon: Brain,
    title: "AI-Powered Classification",
    description: "5-agent pipeline classifies, extracts, matches, computes, and narrates.",
  },
  {
    icon: Shield,
    title: "Entity Resolution",
    description: "3-tier product matching across retailers normalises SKUs and formats.",
  },
  {
    icon: BarChart3,
    title: "Datagram Metrics Suite",
    description: "ROAS, iROAS, mROAS, ROI + 10 KPIs computed automatically.",
  },
  {
    icon: Zap,
    title: "Narrative Intelligence",
    description: "SignalStack strategic analysis cards with executive-level summaries.",
  },
  {
    icon: MessageSquare,
    title: "WhatsApp Delivery",
    description: "Proactive alerts and scheduled digests straight to your phone.",
  },
];

const pricingPlans = [
  {
    name: "Starter",
    price: "$999",
    period: "/mo",
    popular: false,
    features: [
      "Sell-out harmonisation",
      "Basic dashboard",
      "5 uploads / month",
      "Email support",
    ],
  },
  {
    name: "Professional",
    price: "$2,999",
    period: "/mo",
    popular: true,
    features: [
      "Everything in Starter",
      "Campaign overlay",
      "AI insights",
      "Unlimited uploads",
      "Priority support",
    ],
  },
  {
    name: "Enterprise",
    price: "Contact Us",
    period: "",
    popular: false,
    features: [
      "Custom integrations",
      "Dedicated account manager",
      "SLA",
      "Multi-brand support",
    ],
  },
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

  const openModal = (plan: string) => {
    setSelectedPlan(plan);
    setModalOpen(true);
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

  const scrollToPricing = () => {
    document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="border-b border-border/60 backdrop-blur-sm sticky top-0 z-50 bg-background/90">
        <div className="container flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <BarChart3 className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-display text-base font-bold tracking-tight text-foreground">Pot Labs</span>
              <span className="text-[10px] text-muted-foreground font-medium">A Pot Strategy Company</span>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild>
              <Link to="/login">Sign in</Link>
            </Button>
            <Button onClick={scrollToPricing}>
              View Pricing <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="container py-24 lg:py-32">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-3xl mx-auto text-center"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-semibold mb-8 uppercase tracking-widest">
            Commerce Intelligence Harmoniser
          </div>
          <h1 className="font-display text-5xl lg:text-6xl font-extrabold tracking-tight mb-6 leading-[1.08]">
            Connect ad spend to commercial outcomes in{" "}
            <span className="text-primary">90 seconds</span>
          </h1>
          <p className="text-base text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
            Upload retailer sell-out data and campaign reports. Five AI agents harmonise formats, normalise SKUs, compute ROAS/iROAS/mROAS/ROI, and generate executive-level narrative analysis — so you can prove what worked.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Button size="lg" onClick={scrollToPricing} className="text-sm px-8 font-semibold">
              View Pricing <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" asChild className="text-sm px-8">
              <Link to="/login">View Demo</Link>
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
              <span className="text-[11px] text-muted-foreground ml-3 font-medium">Commerce Intelligence Harmoniser</span>
            </div>
            <div className="p-6 grid grid-cols-4 gap-3">
              {[
                { label: "Revenue", value: "$2.4M", change: "+12%" },
                { label: "ROAS", value: "7.1x", change: "+15%" },
                { label: "iROAS", value: "4.3x", change: "+8%" },
                { label: "CPS", value: "$1.82", change: "-6%" },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-border bg-background p-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1">{item.label}</p>
                  <p className="font-display text-xl font-bold">{item.value}</p>
                  <p className={`text-xs mt-1 font-medium ${item.change.startsWith('+') ? 'text-success' : 'text-destructive'}`}>
                    {item.change} MoM
                  </p>
                </div>
              ))}
              <div className="col-span-4 h-32 rounded-lg border border-border bg-muted/20 flex items-center justify-center">
                <BarChart3 className="h-8 w-8 text-muted-foreground/20" />
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section className="container py-24 border-t border-border/40">
        <div className="text-center mb-16">
          <h2 className="font-display text-3xl font-bold mb-3">Five agents. One truth.</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            From raw retailer exports to boardroom-ready insights in under two minutes.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              viewport={{ once: true }}
              className="rounded-xl border border-border bg-card p-6 hover:shadow-md hover:border-primary/20 transition-all"
            >
              <div className="h-10 w-10 rounded-lg bg-primary/8 flex items-center justify-center mb-4">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-display font-semibold text-base mb-2">{f.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{f.description}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="container py-24 border-t border-border/40">
        <div className="text-center mb-16">
          <h2 className="font-display text-3xl font-bold mb-3">Simple, transparent pricing</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Choose the plan that fits your team. All plans include onboarding support.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {pricingPlans.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              viewport={{ once: true }}
              className={`rounded-xl border p-8 flex flex-col relative ${
                plan.popular
                  ? "border-primary bg-card shadow-lg ring-1 ring-primary/20"
                  : "border-border bg-card"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                  Most Popular
                </div>
              )}
              <h3 className="font-display text-lg font-bold mb-2">{plan.name}</h3>
              <div className="mb-6">
                <span className="font-display text-4xl font-extrabold">{plan.price}</span>
                <span className="text-muted-foreground text-sm">{plan.period}</span>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feat) => (
                  <li key={feat} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => openModal(plan.name)}
                variant={plan.popular ? "default" : "outline"}
                className="w-full"
              >
                {plan.price === "Contact Us" ? "Contact Us" : "Get Started"}
              </Button>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container py-24">
        <div className="max-w-3xl mx-auto text-center rounded-2xl bg-primary p-12">
          <h2 className="font-display text-3xl font-bold text-primary-foreground mb-4">
            Prove what worked. In 90 seconds.
          </h2>
          <p className="text-primary-foreground/80 mb-8">
            Get in touch to see how Pot Labs can transform your commerce data.
          </p>
          <Button size="lg" variant="secondary" onClick={scrollToPricing} className="text-sm px-8 font-semibold">
            View Pricing <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* Footer */}
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

      {/* Waitlist Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Get Started — {selectedPlan}</DialogTitle>
            <DialogDescription>Fill in your details and we'll reach out shortly.</DialogDescription>
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
              <Label htmlFor="wl-plan">Selected plan</Label>
              <Input id="wl-plan" value={selectedPlan} readOnly className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wl-msg">Message (optional)</Label>
              <Textarea id="wl-msg" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Tell us about your needs..." rows={3} />
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
