import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Check, Sparkles, Lock } from "lucide-react";
import { useGetPlans, useGetSubscription, useCreateCheckout } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function SubscribePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [interval, setInterval] = useState<"month" | "year">("month");

  const { data: subStatus, isLoading: isLoadingSub } = useGetSubscription();
  const { data: plansData, isLoading: isLoadingPlans } = useGetPlans();
  const createCheckout = useCreateCheckout();

  useEffect(() => {
    // If already subscribed, redirect to dashboard
    if (subStatus?.isSubscribed) {
      setLocation("/dashboard");
    }
  }, [subStatus, setLocation]);

  const handleSubscribe = (priceId: string) => {
    createCheckout.mutate(
      { data: { priceId } },
      {
        onSuccess: (res) => {
          window.location.href = res.url;
        },
        onError: () => {
          toast({
            variant: "destructive",
            title: "Checkout failed",
            description: "Could not initiate payment. Please try again.",
          });
        }
      }
    );
  };

  if (isLoadingSub || isLoadingPlans) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
      </div>
    );
  }

  const plans = plansData?.plans || [];
  const filteredPlans = plans.filter(p => p.interval === interval);

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <header className="p-6 flex justify-center">
        <img src="/logo.svg" alt="Logo" className="w-8 h-8" />
      </header>

      <main className="flex-1 flex flex-col items-center py-12 px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center justify-center p-3 rounded-full bg-primary/10 mb-6">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-serif text-foreground mb-4">Unlock the Frequency</h1>
          <p className="text-muted-foreground text-lg font-light">
            Absolute privacy requires a premium infrastructure. Subscribe to create unlimited secure rooms and use real-time voice disguise.
          </p>
        </div>

        {/* Toggle */}
        {plans.some(p => p.interval === 'year') && (
          <div className="bg-card p-1 rounded-full flex border border-card-border mb-12">
            <button
              onClick={() => setInterval("month")}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-colors ${interval === "month" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setInterval("year")}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-colors ${interval === "year" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Yearly
            </button>
          </div>
        )}

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl w-full">
          {filteredPlans.length > 0 ? (
             filteredPlans.map((plan, i) => (
              <motion.div
                key={plan.priceId}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className={`relative p-8 rounded-3xl border bg-card/50 backdrop-blur-sm flex flex-col ${
                  i === 0 ? "border-primary/50 shadow-[0_0_30px_rgba(194,133,106,0.1)]" : "border-card-border"
                }`}
              >
                {i === 0 && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider rounded-full flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Recommended
                  </div>
                )}
                
                <h3 className="text-2xl font-serif text-foreground mb-2">{plan.name}</h3>
                <div className="mb-6 flex items-baseline gap-1">
                  <span className="text-4xl font-light text-foreground">${plan.amount / 100}</span>
                  <span className="text-muted-foreground">/{plan.interval}</span>
                </div>
                
                <ul className="space-y-4 mb-8 flex-1">
                  {[
                    "Unlimited secure calling rooms",
                    "Real-time AI voice disguise (M/F)",
                    "End-to-end encrypted connections",
                    "Self-destructing access links",
                    "Priority network routing"
                  ].map((feature, j) => (
                    <li key={j} className="flex items-start gap-3 text-sm text-muted-foreground">
                      <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                
                <Button 
                  onClick={() => handleSubscribe(plan.priceId)}
                  disabled={createCheckout.isPending}
                  className={`w-full py-6 rounded-xl ${
                    i === 0 
                      ? "bg-primary hover:bg-secondary text-primary-foreground" 
                      : "bg-muted hover:bg-muted/80 text-foreground"
                  }`}
                >
                  {createCheckout.isPending ? "Processing..." : "Select Plan"}
                </Button>
              </motion.div>
            ))
          ) : (
            <div className="col-span-full p-8 text-center bg-card border border-card-border rounded-2xl">
              <p className="text-muted-foreground">No plans available for {interval} billing at this time.</p>
              {plans.length === 0 && <p className="text-xs mt-2 opacity-50">Admin: Configure Stripe products to see plans here.</p>}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}