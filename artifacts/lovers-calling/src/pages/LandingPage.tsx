import { Link } from "wouter";
import { motion } from "framer-motion";
import { Lock, Phone, Volume2, Shield } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary/30">
      <header className="absolute top-0 left-0 right-0 z-50 p-6 flex justify-between items-center max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="Lovers Calling" className="w-8 h-8" />
          <span className="font-serif text-xl tracking-wide text-foreground">Lovers Calling</span>
        </div>
        <Link href="/sign-in" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors tracking-wide uppercase">
          Sign In
        </Link>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative min-h-[100dvh] flex items-center justify-center overflow-hidden">
          {/* Background Image with Overlay */}
          <div className="absolute inset-0 z-0">
            <img 
              src="/attached_assets/generated_images/hero-bg.jpg" 
              alt="Atmospheric background" 
              className="w-full h-full object-cover object-center opacity-60"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/80 to-background"></div>
            <div className="absolute inset-0 bg-background/30 backdrop-blur-[2px]"></div>
          </div>

          <div className="relative z-10 max-w-4xl mx-auto px-6 text-center mt-20">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            >
              <h1 className="font-serif text-5xl md:text-7xl lg:text-8xl text-foreground leading-[1.1] mb-6 drop-shadow-2xl">
                A private frequency. <br />
                <span className="text-primary italic">Only for two.</span>
              </h1>
            </motion.div>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed font-light tracking-wide"
            >
              Connect intimately in absolute secrecy. Real-time voice disguise, end-to-end encryption, and one-time links that vanish like a whisper in the dark.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col sm:flex-row items-center justify-center gap-6"
            >
              <Link href="/sign-up" className="px-8 py-4 bg-primary text-primary-foreground font-medium rounded-full tracking-wider uppercase text-sm hover:bg-secondary transition-all shadow-[0_0_30px_rgba(194,133,106,0.3)] hover:shadow-[0_0_40px_rgba(212,169,106,0.4)] w-full sm:w-auto text-center">
                Start Speaking
              </Link>
            </motion.div>
          </div>
          
          {/* Scroll Indicator */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5, duration: 1 }}
            className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-muted-foreground"
          >
            <span className="text-xs uppercase tracking-widest font-mono">Discover</span>
            <div className="w-[1px] h-12 bg-gradient-to-b from-primary/50 to-transparent"></div>
          </motion.div>
        </section>

        {/* Features Section */}
        <section className="py-32 relative z-10 bg-background border-t border-border/50">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {[
                { icon: Phone, title: "Private Calls", desc: "No phone numbers required. Just a secure, temporary link." },
                { icon: Volume2, title: "Voice Disguise", desc: "Transform your voice pitch instantly. Remain completely anonymous." },
                { icon: Lock, title: "One-Time Links", desc: "Codes expire immediately after use. No traces left behind." },
                { icon: Shield, title: "End-to-End Encrypted", desc: "Direct WebRTC connections. We couldn't listen even if we tried." }
              ].map((feature, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-100px" }}
                  transition={{ duration: 0.7, delay: i * 0.1 }}
                  className="p-8 rounded-2xl bg-card border border-card-border hover:border-primary/30 transition-colors group"
                >
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary/20 transition-colors">
                    <feature.icon className="w-5 h-5 text-primary" strokeWidth={1.5} />
                  </div>
                  <h3 className="text-xl font-serif mb-3 text-foreground">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{feature.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Sensory Detail Section */}
        <section className="py-32 relative z-10 border-t border-border/50 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-primary/5"></div>
          <div className="max-w-7xl mx-auto px-6 relative">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 1 }}
              >
                <h2 className="font-serif text-4xl md:text-5xl mb-6 text-foreground leading-tight">
                  Intimacy in <br /> <span className="text-secondary italic">anonymity.</span>
                </h2>
                <p className="text-lg text-muted-foreground font-light leading-relaxed mb-8">
                  There is power in speaking without being seen. Lovers Calling creates a space where conversations can be deeply personal, completely removed from your daily identity.
                </p>
                <div className="space-y-4">
                  <div className="flex items-center gap-4 text-sm text-foreground font-mono tracking-wide">
                    <div className="w-8 h-[1px] bg-primary"></div>
                    <span>Crystal clear audio</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-foreground font-mono tracking-wide">
                    <div className="w-8 h-[1px] bg-secondary"></div>
                    <span>No download required</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-foreground font-mono tracking-wide">
                    <div className="w-8 h-[1px] bg-primary"></div>
                    <span>Premium network routing</span>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 1 }}
                className="relative aspect-square md:aspect-[4/3] rounded-3xl overflow-hidden border border-border/50 shadow-2xl"
              >
                 <div className="absolute inset-0 bg-[url('/attached_assets/generated_images/hero-bg.jpg')] bg-cover bg-center opacity-40 mix-blend-luminosity"></div>
                 <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-32 h-32 rounded-full border border-primary/30 flex items-center justify-center">
                      <div className="w-24 h-24 rounded-full border-2 border-primary/50 flex items-center justify-center animate-pulse">
                        <div className="w-16 h-16 rounded-full bg-primary/20 backdrop-blur-md flex items-center justify-center">
                          <Phone className="w-6 h-6 text-primary" />
                        </div>
                      </div>
                    </div>
                 </div>
              </motion.div>
            </div>
          </div>
        </section>
      </main>

      <footer className="py-12 border-t border-border/50 text-center relative z-10 bg-background">
        <div className="flex items-center justify-center gap-3 mb-6">
          <img src="/logo.svg" alt="Lovers Calling" className="w-6 h-6 opacity-50" />
        </div>
        <p className="text-xs text-muted-foreground font-mono tracking-widest uppercase">
          &copy; {new Date().getFullYear()} Lovers Calling. All rights reserved.
        </p>
      </footer>
    </div>
  );
}