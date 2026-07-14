import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Coins, Zap, Flame, Star, Key, ChevronRight, Check, ArrowLeft } from "lucide-react";
import { useAuth } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const PACKAGES = [
  {
    id: "spark",
    label: "Spark",
    tokens: 5,
    description: "5 private calls",
    icon: Zap,
    color: "from-amber-500/20 to-amber-600/10",
    border: "border-amber-500/30",
    accent: "text-amber-400",
  },
  {
    id: "flame",
    label: "Flame",
    tokens: 15,
    description: "15 private calls",
    icon: Flame,
    color: "from-orange-500/20 to-red-600/10",
    border: "border-orange-500/30",
    accent: "text-orange-400",
    popular: true,
  },
  {
    id: "inferno",
    label: "Inferno",
    tokens: 30,
    description: "30 private calls",
    icon: Star,
    color: "from-primary/20 to-primary/5",
    border: "border-primary/40",
    accent: "text-primary",
  },
];

type View = "packages" | "confirm" | "code";

export default function TokensPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const [view, setView] = useState<View>("packages");
  const [selectedPkg, setSelectedPkg] = useState<(typeof PACKAGES)[0] | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [code, setCode] = useState("");
  const [isRedeeming, setIsRedeeming] = useState(false);

  const handleSelectPackage = (pkg: (typeof PACKAGES)[0]) => {
    setSelectedPkg(pkg);
    setView("confirm");
  };

  const handleRequestTopup = async () => {
    if (!selectedPkg) return;
    setIsSubmitting(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/tokens/request", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ packageId: selectedPkg.id }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({ title: "Request sent ✓", description: "The admin has been notified. You'll get tokens once payment is confirmed." });
        setView("packages");
        setSelectedPkg(null);
      } else {
        toast({ variant: "destructive", title: "Failed", description: data.error ?? "Could not submit request." });
      }
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Connection failed. Try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRedeemCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setIsRedeeming(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/tokens/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: code.trim().toUpperCase() }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Tokens added ✓", description: data.message });
        queryClient.invalidateQueries();
        setCode("");
        setLocation("/dashboard");
      } else {
        toast({ variant: "destructive", title: "Invalid Code", description: data.error ?? "Code not recognised." });
      }
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Connection failed. Try again." });
    } finally {
      setIsRedeeming(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(194,133,106,0.07)_0%,rgba(13,10,16,1)_65%)] pointer-events-none" />

      <header className="p-6 flex items-center gap-4 relative z-10">
        <button onClick={() => setLocation("/dashboard")} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <Coins className="w-5 h-5 text-primary" />
          <span className="font-serif text-lg text-foreground">Buy Tokens</span>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-6 pb-12 relative z-10 max-w-lg mx-auto w-full">

        <AnimatePresence mode="wait">
          {/* ── Package selection ── */}
          {view === "packages" && (
            <motion.div key="packages" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="w-full">
              <div className="text-center mb-8">
                <h1 className="text-3xl font-serif text-foreground mb-2">Top Up Tokens</h1>
                <p className="text-muted-foreground text-sm">Each token = 1 private call. Pick a package, pay, and get approved.</p>
              </div>

              <div className="space-y-4 mb-8">
                {PACKAGES.map((pkg) => {
                  const Icon = pkg.icon;
                  return (
                    <motion.button
                      key={pkg.id}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleSelectPackage(pkg)}
                      className={`w-full relative flex items-center gap-5 p-5 rounded-2xl bg-gradient-to-r ${pkg.color} border ${pkg.border} hover:border-opacity-60 transition-all text-left`}
                    >
                      {pkg.popular && (
                        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-primary text-[#0d0a10] text-[10px] font-mono font-bold tracking-widest uppercase">
                          Most Popular
                        </div>
                      )}
                      <div className={`w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center ${pkg.accent}`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <div className="flex-1">
                        <div className="font-serif text-lg text-foreground">{pkg.label}</div>
                        <div className="text-sm text-muted-foreground">{pkg.description}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-2xl font-bold ${pkg.accent}`}>{pkg.tokens}</span>
                        <span className="text-xs text-muted-foreground font-mono">tokens</span>
                        <ChevronRight className="w-4 h-4 text-muted-foreground ml-1" />
                      </div>
                    </motion.button>
                  );
                })}
              </div>

              {/* Code redemption */}
              <div className="rounded-2xl bg-card border border-card-border p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Key className="w-4 h-4 text-primary" />
                  <span className="font-mono text-xs uppercase tracking-widest text-primary">Have a code?</span>
                </div>
                <form onSubmit={handleRedeemCode} className="flex gap-3">
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="XXXX-XXXX"
                    className="flex-1 bg-[#120e15] border border-[#2b2131] rounded-xl py-3 px-4 text-foreground font-mono tracking-[0.15em] uppercase placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all text-sm"
                  />
                  <Button
                    type="submit"
                    disabled={!code.trim() || isRedeeming}
                    className="bg-primary/20 text-primary hover:bg-primary hover:text-[#0d0a10] border-0 px-5 rounded-xl"
                  >
                    {isRedeeming ? <div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" /> : "Redeem"}
                  </Button>
                </form>
              </div>
            </motion.div>
          )}

          {/* ── Confirm & payment details ── */}
          {view === "confirm" && selectedPkg && (
            <motion.div key="confirm" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="w-full">
              <button onClick={() => setView("packages")} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8 text-sm">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>

              <div className="text-center mb-8">
                <div className="text-5xl mb-3">{selectedPkg.id === "spark" ? "⚡" : selectedPkg.id === "flame" ? "🔥" : "⭐"}</div>
                <h2 className="text-2xl font-serif text-foreground">{selectedPkg.label} — {selectedPkg.tokens} Tokens</h2>
                <p className="text-muted-foreground text-sm mt-1">{selectedPkg.description}</p>
              </div>

              <div className="rounded-2xl bg-card border border-card-border p-6 mb-6 space-y-4">
                <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">How it works</p>
                {[
                  "Send payment to the account below",
                  "Tap Request — admin gets notified instantly",
                  "Once payment is confirmed, tokens are added",
                ].map((step, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</div>
                    <p className="text-sm text-foreground">{step}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl bg-primary/5 border border-primary/20 p-6 mb-6">
                <p className="text-xs font-mono uppercase tracking-widest text-primary mb-4">Payment Details</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bank</span>
                    <span className="text-foreground font-medium">{import.meta.env.VITE_PAYMENT_BANK ?? "Contact Admin"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name</span>
                    <span className="text-foreground font-medium">{import.meta.env.VITE_PAYMENT_ACCOUNT_NAME ?? "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Account No.</span>
                    <span className="text-foreground font-mono font-bold tracking-widest">{import.meta.env.VITE_PAYMENT_ACCOUNT_NUMBER ?? "—"}</span>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleRequestTopup}
                disabled={isSubmitting}
                className="w-full py-6 rounded-xl bg-gradient-to-r from-primary to-[#8c574b] hover:from-secondary hover:to-primary text-[#0d0a10] font-medium text-base tracking-wide shadow-[0_0_20px_rgba(194,133,106,0.2)]"
              >
                {isSubmitting ? (
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full border-2 border-[#0d0a10] border-t-transparent animate-spin" />
                    Notifying admin…
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Check className="w-5 h-5" />
                    I've Paid — Request {selectedPkg.tokens} Tokens
                  </div>
                )}
              </Button>
              <p className="text-center text-[10px] text-muted-foreground mt-3 font-mono">Tokens are added after manual payment verification</p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
