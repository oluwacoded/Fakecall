import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Plus, Copy, Trash2, Check, Lock, Coins, ShoppingCart, LogOut, Ghost } from "lucide-react";
import { useGetDashboard, useListRooms, useCreateRoom, useDeleteRoom } from "@workspace/api-client-react";
import { useClerk } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function DashboardPage() {
  const [, setLocation] = useLocation();
  const { signOut } = useClerk();
  const { toast } = useToast();
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [ghostingCode, setGhostingCode] = useState<string | null>(null);

  const { data: dashboard, isLoading: isLoadingDash, refetch: refetchDash } = useGetDashboard();
  const { data: roomList, isLoading: isLoadingRooms, refetch: refetchRooms } = useListRooms();

  const createRoom = useCreateRoom();
  const deleteRoom = useDeleteRoom();

  const tokens: number = (dashboard as any)?.tokens ?? 0;

  const handleCreateRoom = () => {
    if (tokens < 1) {
      toast({
        variant: "destructive",
        title: "No tokens",
        description: "Buy tokens to start a call.",
      });
      setLocation("/tokens");
      return;
    }
    createRoom.mutate(undefined, {
      onSuccess: (newRoom) => {
        toast({ title: "Room created", description: `Room ${newRoom.callCode} is ready. 1 token used.` });
        refetchRooms();
        refetchDash();
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? "Please try again later.";
        if (err?.response?.data?.noTokens) setLocation("/tokens");
        toast({ variant: "destructive", title: "Failed", description: msg });
      },
    });
  };

  const handleDeleteRoom = (id: string) => {
    deleteRoom.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Room deleted", description: "The connection has been severed." });
        refetchRooms();
      },
    });
  };

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/call/${code}`);
    setCopiedCode(code);
    toast({ title: "Link copied", description: "Send this link securely to your partner." });
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const copyGhostLink = async (code: string) => {
    setGhostingCode(code);
    try {
      const fullUrl = `${window.location.origin}/call/${code}`;
      const res = await fetch("/api/shorten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: fullUrl }),
      });
      const data = await res.json();
      const short = data.shortUrl ?? fullUrl;
      await navigator.clipboard.writeText(short);
      toast({
        title: "Ghost link copied",
        description: "A disguised link is on your clipboard. It expires when the room ends.",
      });
    } catch {
      toast({ variant: "destructive", title: "Failed", description: "Could not create ghost link." });
    } finally {
      setGhostingCode(null);
    }
  };

  if (isLoadingDash || isLoadingRooms) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  const rooms = (roomList as any)?.rooms ?? [];

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/30 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="Logo" className="w-6 h-6" />
            <span className="font-serif text-lg text-foreground tracking-wide">Frequency</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Token balance pill */}
            <button
              onClick={() => setLocation("/tokens")}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 hover:bg-primary/20 transition-all"
            >
              <Coins className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-mono font-bold text-primary">{tokens}</span>
              <span className="text-[10px] text-primary/70 font-mono hidden sm:inline">tokens</span>
              {tokens === 0 && (
                <ShoppingCart className="w-3 h-3 text-primary ml-0.5" />
              )}
            </button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => signOut({ redirectUrl: "/" })}
              className="text-muted-foreground hover:text-foreground"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        {/* Token banner when empty */}
        {tokens === 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-5 rounded-2xl bg-primary/5 border border-primary/20 flex flex-col sm:flex-row items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3">
              <Coins className="w-6 h-6 text-primary flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">You have no tokens</p>
                <p className="text-xs text-muted-foreground">Each call costs 1 token. Buy a pack to get started.</p>
              </div>
            </div>
            <Button
              onClick={() => setLocation("/tokens")}
              className="bg-primary text-[#0d0a10] hover:bg-primary/80 shrink-0"
            >
              <ShoppingCart className="w-4 h-4 mr-2" />
              Buy Tokens
            </Button>
          </motion.div>
        )}

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <h1 className="text-3xl font-serif text-foreground mb-1">Your Private Rooms</h1>
            <p className="text-sm text-muted-foreground">
              {tokens > 0
                ? `${tokens} token${tokens !== 1 ? "s" : ""} available — each new room costs 1`
                : "Buy tokens to create rooms"}
            </p>
          </div>
          <Button
            onClick={handleCreateRoom}
            disabled={createRoom.isPending || tokens < 1}
            className="bg-primary text-[#0d0a10] hover:bg-primary/80 disabled:opacity-50 gap-2"
          >
            <Plus className="w-4 h-4" />
            {createRoom.isPending ? "Creating…" : "New Room (1 token)"}
          </Button>
        </div>

        {rooms.length === 0 ? (
          <div className="text-center py-24 border border-dashed border-border rounded-3xl">
            <Lock className="w-8 h-8 text-muted-foreground/40 mx-auto mb-4" />
            <p className="text-muted-foreground text-sm">No rooms yet.</p>
            <p className="text-muted-foreground/60 text-xs mt-1">Create a room and share the link with your partner.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rooms.map((room: any, i: number) => (
              <motion.div
                key={room.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex flex-col sm:flex-row items-center justify-between p-4 sm:p-5 rounded-2xl bg-card border border-card-border hover:border-primary/30 transition-colors group gap-4"
              >
                <div className="flex items-center gap-4 w-full sm:w-auto">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Lock className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <div className="font-mono text-lg tracking-widest text-foreground">{room.callCode}</div>
                    <div className="text-xs text-muted-foreground">Created {new Date(room.createdAt).toLocaleDateString()}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button
                    variant="outline"
                    className="flex-1 sm:flex-none border-border hover:bg-muted hover:text-foreground"
                    onClick={() => copyToClipboard(room.callCode)}
                  >
                    {copiedCode === room.callCode
                      ? <><Check className="w-4 h-4 mr-2 text-green-500" />Copied</>
                      : <><Copy className="w-4 h-4 mr-2" />Copy Link</>}
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 sm:flex-none border-primary/30 text-primary/80 hover:bg-primary/10 hover:text-primary hover:border-primary/50"
                    onClick={() => copyGhostLink(room.callCode)}
                    disabled={ghostingCode === room.callCode}
                    title="Ghost link — disguised short URL that hides the domain"
                  >
                    {ghostingCode === room.callCode
                      ? <><div className="w-4 h-4 mr-2 border border-primary border-t-transparent rounded-full animate-spin" />Ghost...</>
                      : <><Ghost className="w-4 h-4 mr-2" />Ghost Link</>}
                  </Button>
                  <Link href={`/call/${room.callCode}`}>
                    <Button className="flex-1 sm:flex-none bg-primary/20 text-primary hover:bg-primary hover:text-primary-foreground border-0">
                      Join Call
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleDeleteRoom(room.id)}
                    disabled={deleteRoom.isPending}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
