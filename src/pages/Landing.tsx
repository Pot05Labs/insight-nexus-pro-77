import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowDown,
  Layers,
  Target,
  ShoppingCart,
  BarChart3,
  Brain,
  TrendingUp,
  MapPin,
  Shield,
  Upload,
  Link2,
  BarChart2,
  Rocket,
  Quote,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/* ─── Value Cards ─── */
const valueCards = [
  {
    icon: Layers,
    title: "Unified View",
    description:
      "Campaign spend, impressions, clicks \u2014 mapped directly against revenue, units sold, and margin. Across retailers. Across regions. In one dashboard.",
  },
  {
    icon: TrendingUp,
    title: "Real Comparisons",
    description:
      "Week-on-week. Month-on-month. Retailer vs retailer. See what\u2019s growing, what\u2019s declining, and where the opportunities are hiding.",
  },
  {
    icon: Brain,
    title: "AI That Thinks Like a Strategist",
    description:
      "Not just charts \u2014 narrative intelligence. SignalStack surfaces the \u201Cso what\u201D and the \u201Cnow what\u201D so you can walk into any meeting with a clear recommendation.",
  },
  {
    icon: MapPin,
    title: "Built for South Africa",
    description:
      "Pick n Pay, Checkers, Woolworths, Spar, Clicks, Dis-Chem \u2014 we understand the local retail ecosystem because it\u2019s the only one we focus on.",
  },
];

/* ─── Audience Cards ─── */
const audiences = [
  {
    icon: Target,
    title: "Brand Marketers",
    description:
      "You invest in campaigns and need to show commercial impact \u2014 not just impressions. SignalStack gives you the sell-through story behind every rand spent.",
  },
  {
    icon: Shield,
    title: "Media Agencies",
    description:
      "Your clients want proof. SignalStack arms you with independent, retailer-verified performance data that makes your recommendations bulletproof.",
  },
  {
    icon: ShoppingCart,
    title: "Trade & Retail Teams",
    description:
      "You see what sells but not why. SignalStack connects promotional activity to shelf performance so you can plan with confidence, not instinct.",
  },
];

/* ─── How It Works Steps ─── */
const steps = [
  {
    num: "01",
    title: "Upload",
    icon: Upload,
    description:
      "Drop in your sell-out data and campaign reports. CSV, Excel \u2014 whatever you\u2019ve got. SignalStack handles the rest.",
  },
  {
    num: "02",
    title: "Connect",
    icon: Link2,
    description:
      "We harmonise your data across sources so you can compare what was previously incomparable. Retailers, regions, time periods \u2014 all normalised.",
  },
  {
    num: "03",
    title: "See",
    icon: BarChart2,
    description:
      "Dashboards, benchmarks, and AI-powered insights \u2014 all scoped to your brands, your campaigns, your markets.",
  },
  {
    num: "04",
    title: "Act",
    icon: Rocket,
    description:
      "Walk into your next meeting with a clear, data-backed recommendation. No more \u201Cwe think\u201D \u2014 just \u201Cwe know.\u201D",
  },
];

/* ─── Animation helpers ─── */
const fadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
};

const Landing = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const BOOKING_URL =
    "https://outlook.office.com/bookwithme/user/943573cc7f2b4fe4b2b02030342c8dc9@potstrategy.com?anonymous&ismsaljsauthenabled&ep=pcard";

  const openDemo = () => window.open(BOOKING_URL, "_blank", "noopener,noreferrer");

  const scrollToHowItWorks = () => {
    document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.from("waitlist_leads").insert({
      full_name: fullName.trim(),
      company_name: company.trim(),
      email: email.trim(),
      selected_plan: "Demo Request",
      message: message.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      toast({ title: "Something went wrong", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Thanks! We\u2019ll be in touch shortly." });
      setModalOpen(false);
      setFullName("");
      setCompany("");
      setEmail("");
      setMessage("");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  NAV                                                          */}
      {/* ═══════════════════════════════════════════════════════════════ */}
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
              Book a Demo <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </nav>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  1. HERO                                                      */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <section className="container py-24 lg:py-32">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-3xl mx-auto text-center"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-semibold mb-8 uppercase tracking-widest">
            Commerce Intelligence for South Africa&rsquo;s Leading Brands
          </div>

          <h1 className="font-display text-4xl lg:text-5xl font-extrabold tracking-tight mb-6 leading-[1.12]">
            You&rsquo;re spending millions on media.{" "}
            <span className="text-primary">Do you know what it&rsquo;s actually selling?</span>
          </h1>

          <p className="text-base lg:text-lg text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
            SignalStack connects your advertising investment to real sell-out performance &mdash; across every retailer, every region, every SKU. One view. No guesswork.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" onClick={openDemo} className="text-sm px-8 font-semibold">
              Book a Demo <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={scrollToHowItWorks} className="text-sm px-8 group">
              See how it works{" "}
              <ArrowDown className="ml-2 h-4 w-4 group-hover:translate-y-0.5 transition-transform" />
            </Button>
          </div>
        </motion.div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  2. TENSION — The Problem                                     */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <section className="border-t border-border/40">
        <div className="container py-24">
          <motion.div {...fadeUp} transition={{ duration: 0.5 }} className="max-w-3xl mx-auto">
            <h2 className="font-display text-3xl font-bold mb-8 text-center">
              The data exists. It&rsquo;s just never in the same room.
            </h2>

            <div className="space-y-5 text-muted-foreground leading-relaxed text-base lg:text-lg">
              <p>
                Your media agency sends you a campaign report. Your retail partners send you sell-out numbers. Your trade team has their own spreadsheets. Your finance team asks what the return was.
              </p>
              <p>
                And suddenly you&rsquo;re in a room full of smart people, all looking at different numbers, trying to answer the same question:
              </p>
            </div>

            <motion.div
              {...fadeUp}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="my-10 border-l-4 border-primary pl-6 py-2"
            >
              <p className="text-xl lg:text-2xl font-display font-semibold italic text-foreground">
                &ldquo;Did that campaign actually move product off the shelf?&rdquo;
              </p>
            </motion.div>

            <p className="text-muted-foreground leading-relaxed text-base lg:text-lg">
              Right now, the answer takes weeks. Multiple exports. Manual reconciliation. And even then, you&rsquo;re not quite sure.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  3. VALUE — What Changes                                      */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <section className="border-t border-border/40">
        <div className="container py-24">
          <motion.div {...fadeUp} transition={{ duration: 0.5 }} className="text-center mb-16">
            <h2 className="font-display text-3xl font-bold mb-4">
              What if you could see the full picture &mdash; in minutes?
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              SignalStack brings your media performance and retail sell-out data into a single intelligence layer. Upload your data, and watch the connections appear.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {valueCards.map((card, i) => (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                viewport={{ once: true }}
                className="rounded-xl border border-border bg-card p-6 hover:shadow-md hover:border-primary/20 transition-all"
              >
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <card.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-display font-semibold text-base mb-2">{card.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{card.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  4. AUDIENCE — Who It's For                                   */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <section className="border-t border-border/40">
        <div className="container py-24">
          <motion.div {...fadeUp} transition={{ duration: 0.5 }} className="text-center mb-16">
            <h2 className="font-display text-3xl font-bold mb-3">
              Built for the people who have to prove the return.
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {audiences.map((a, i) => (
              <motion.div
                key={a.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                viewport={{ once: true }}
                className="rounded-xl border border-border bg-card p-6 text-center"
              >
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <a.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-display font-semibold text-base mb-2">{a.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{a.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  5. CREDIBILITY — Independent Measurement                     */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <section className="border-t border-border/40">
        <div className="container py-24">
          <motion.div {...fadeUp} transition={{ duration: 0.5 }} className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-primary/10 mb-6">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <h2 className="font-display text-3xl font-bold mb-6">
              Independent measurement. No conflicts of interest.
            </h2>
            <div className="rounded-xl border border-border bg-card p-8 lg:p-10">
              <p className="text-muted-foreground leading-relaxed text-base lg:text-lg">
                Nobody should mark their own homework. SignalStack is an independent intelligence layer &mdash; we don&rsquo;t sell media, we don&rsquo;t represent retailers, and we don&rsquo;t have a horse in the race. We exist so you can see the truth in your data and make better decisions with it.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  6. HOW IT WORKS                                              */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <section id="how-it-works" className="border-t border-border/40">
        <div className="container py-24">
          <motion.div {...fadeUp} transition={{ duration: 0.5 }} className="text-center mb-16">
            <h2 className="font-display text-3xl font-bold mb-3">
              Simple to start. Powerful once you&rsquo;re in.
            </h2>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {steps.map((s, i) => (
              <motion.div
                key={s.num}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                viewport={{ once: true }}
                className="rounded-xl border border-border bg-card p-6 text-center relative"
              >
                <div className="text-4xl font-display font-extrabold text-primary/10 mb-3">{s.num}</div>
                <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <s.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-display font-semibold text-base mb-2">{s.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{s.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  7. SOCIAL PROOF / TRUST STRIP                                */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <section className="border-t border-border/40">
        <div className="container py-20">
          <motion.div {...fadeUp} transition={{ duration: 0.5 }} className="max-w-3xl mx-auto text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-10">
              Trusted by commerce teams across South Africa
            </p>

            {/* Placeholder logo strip */}
            <div className="flex items-center justify-center gap-10 mb-12 opacity-30">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-8 w-24 rounded bg-muted-foreground/20" />
              ))}
            </div>

            {/* Testimonial placeholder */}
            <div className="rounded-xl border border-border bg-card p-8 relative">
              <Quote className="h-8 w-8 text-primary/15 absolute top-6 left-6" />
              <p className="text-muted-foreground italic leading-relaxed text-base lg:text-lg relative z-10 px-4">
                &ldquo;SignalStack showed us in 10 minutes what used to take our team two weeks to reconcile.&rdquo;
              </p>
              <p className="text-xs text-muted-foreground/60 mt-4">&mdash; Future testimonial</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  8. PRICING TEASER                                            */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <section className="border-t border-border/40">
        <div className="container py-24">
          <motion.div {...fadeUp} transition={{ duration: 0.5 }} className="max-w-2xl mx-auto text-center">
            <Sparkles className="h-8 w-8 text-primary mx-auto mb-4" />
            <h2 className="font-display text-3xl font-bold mb-4">
              Plans that scale with your ambition.
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-8">
              From single-brand analytics to enterprise-wide commerce intelligence. Every plan includes dedicated onboarding and South African support.
            </p>
            <Button size="lg" onClick={openDemo} className="text-sm px-8 font-semibold">
              Book a Demo to See Pricing <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  9. FINAL CTA                                                 */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <section className="container py-24">
        <motion.div
          {...fadeUp}
          transition={{ duration: 0.5 }}
          className="max-w-3xl mx-auto text-center rounded-2xl bg-primary p-12 lg:p-16"
        >
          <h2 className="font-display text-3xl font-bold text-primary-foreground mb-4">
            Your next campaign is already running. Shouldn&rsquo;t you know what it&rsquo;s selling?
          </h2>
          <p className="text-primary-foreground/80 mb-8 max-w-xl mx-auto">
            Book a 20-minute demo and see your data come to life in SignalStack.
          </p>
          <Button size="lg" variant="secondary" onClick={openDemo} className="text-sm px-8 font-semibold">
            Book a Demo <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <p className="text-primary-foreground/60 text-xs mt-4">
            No commitment. No credit card. Just clarity.
          </p>
        </motion.div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  10. FOOTER                                                   */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <footer className="border-t border-border/40 py-10">
        <div className="container">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 text-sm text-muted-foreground">
            <div className="text-center md:text-left">
              <p>
                SignalStack is a product of <strong className="text-foreground">Pot Labs</strong>, the intelligence arm of Pot Strategy (Pty) Ltd.
              </p>
              <p className="mt-0.5">Johannesburg, South Africa.</p>
            </div>
            <div className="flex items-center gap-6">
              <Button variant="outline" size="sm" onClick={openDemo}>
                Book a Demo
              </Button>
              <a
                href="https://www.linkedin.com/company/pot-strategy/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                LinkedIn
              </a>
              <a href="mailto:hello@signalstack.africa" className="hover:text-foreground transition-colors">
                hello@signalstack.africa
              </a>
            </div>
          </div>
          <div className="flex items-center justify-between mt-6 pt-6 border-t border-border/40 text-xs text-muted-foreground">
            <span>&copy; 2025 Pot Strategy (Pty) Ltd. All rights reserved.</span>
            <div className="flex gap-6">
              <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
              <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            </div>
          </div>
        </div>
      </footer>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  DEMO REQUEST MODAL                                           */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Book a Demo</DialogTitle>
            <DialogDescription>
              Fill in your details and we&rsquo;ll set up a 20-minute walkthrough of SignalStack on your data.
            </DialogDescription>
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
              {submitting ? "Submitting\u2026" : "Submit"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Landing;
