import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Lock, Unlock, Key, Send } from "lucide-react";
import { useGetSubscription, getGetSubscriptionQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function SubscribePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const { data: subStatus, isLoading: isLoadingSub } = useGetSubscription();
  
  const [accessCode, setAccessCode] = useState("");
  const [isRedeeming, setIsRedeeming] = useState(false);

  useEffect(() => {
    // If already subscribed, redirect to dashboard
    if (subStatus?.isSubscribed) {
      setLocation("/dashboard");
    }
  }, [subStatus, setLocation]);

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessCode.trim()) return;

    setIsRedeeming(true);
    try {
      const token = await getToken();
      const response = await fetch('/api/redeem', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ code: accessCode.trim().toUpperCase() })
      });
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Access Granted ✓",
          description: "Welcome to the Frequency.",
        });
        queryClient.invalidateQueries({ queryKey: getGetSubscriptionQueryKey() });
        setLocation('/dashboard');
      } else if (data.notAuthenticated) {
        toast({
          variant: "destructive",
          title: "Sign In Required",
          description: "Please sign in first, then enter your code.",
        });
        setLocation('/sign-in');
      } else {
        toast({
          variant: "destructive",
          title: "Invalid Code",
          description: data.error || "This code is invalid or has already been used.",
        });
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Connection Error",
        description: "Failed to verify code. Please try again.",
      });
    } finally {
      setIsRedeeming(false);
    }
  };

  if (isLoadingSub) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(194,133,106,0.05)_0%,rgba(13,10,16,1)_70%)] pointer-events-none"></div>

      <header className="p-6 flex justify-center relative z-10">
        <img src="/logo.svg" alt="Logo" className="w-8 h-8" />
      </header>

      <main className="flex-1 flex flex-col items-center py-12 px-6 relative z-10">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center justify-center p-3 rounded-full bg-primary/10 mb-6">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-serif text-foreground mb-4">Unlock the Frequency</h1>
          <p className="text-muted-foreground text-lg font-light max-w-lg mx-auto">
            Absolute privacy requires a premium infrastructure. Complete your payment and enter your access code to enter the private club.
          </p>
        </div>

        <div className="max-w-md w-full space-y-6">
          {/* Step 1 */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="p-6 rounded-2xl bg-card border border-card-border relative overflow-hidden"
          >
            <div className="text-primary font-mono text-sm uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-xs">1</span>
              Make Payment
            </div>
            <p className="text-foreground mb-4 text-sm leading-relaxed">
              Send your payment to secure your access. Any amount set by the operator.
            </p>
            <div className="bg-[#120e15] rounded-xl p-4 border border-[#2b2131] space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Bank</span>
                <span className="text-foreground font-medium">Opay / Moniepoint</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Account</span>
                <span className="text-foreground font-mono text-lg tracking-widest text-primary">9132883869</span>
              </div>
            </div>
          </motion.div>

          {/* Step 2 */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="p-6 rounded-2xl bg-card border border-card-border"
          >
            <div className="text-primary font-mono text-sm uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-xs">2</span>
              Get Your Code
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed mb-5">
              Send your payment receipt via WhatsApp to receive your exclusive access code.
            </p>
            <a 
              href="https://wa.me/2349132883868" 
              target="_blank" 
              rel="noreferrer"
              className="flex items-center justify-center gap-2 w-full py-4 rounded-xl bg-[#25D366]/10 text-[#25D366] border border-[#25D366]/20 hover:bg-[#25D366]/20 transition-colors font-medium shadow-[0_0_15px_rgba(37,211,102,0.1)] hover:shadow-[0_0_20px_rgba(37,211,102,0.2)]"
            >
              <Send className="w-5 h-5" />
              Contact WhatsApp
            </a>
          </motion.div>

          {/* Step 3 */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="p-6 rounded-2xl bg-card border border-primary/50 shadow-[0_0_30px_rgba(194,133,106,0.1)] relative overflow-hidden mt-8"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl"></div>
            <div className="relative z-10">
              <div className="text-primary font-mono text-sm uppercase tracking-widest mb-5 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-xs">3</span>
                Redeem Code
              </div>
              <form onSubmit={handleRedeem} className="space-y-4">
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <Key className="w-5 h-5" />
                  </div>
                  <input 
                    type="text"
                    value={accessCode}
                    onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                    placeholder="ENTER ACCESS CODE"
                    className="w-full bg-[#120e15] border border-[#2b2131] rounded-xl py-5 pl-12 pr-4 text-foreground font-mono text-lg md:text-xl tracking-[0.2em] uppercase placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all text-center"
                  />
                </div>
                <Button 
                  type="submit"
                  disabled={!accessCode.trim() || isRedeeming}
                  className="w-full py-7 rounded-xl bg-gradient-to-r from-primary to-[#8c574b] hover:from-secondary hover:to-primary text-[#0d0a10] font-medium text-lg tracking-wider uppercase transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(194,133,106,0.2)]"
                >
                  {isRedeeming ? (
                    <div className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full border-2 border-[#0d0a10] border-t-transparent animate-spin"></div>
                      Verifying...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Unlock className="w-6 h-6" />
                      Unlock Access
                    </div>
                  )}
                </Button>
              </form>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
