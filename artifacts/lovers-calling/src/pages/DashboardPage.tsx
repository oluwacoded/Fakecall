import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Plus, Copy, Trash2, PhoneForwarded, Settings, LogOut, Check } from "lucide-react";
import { useGetDashboard, useListRooms, useCreateRoom, useDeleteRoom } from "@workspace/api-client-react";
import { useClerk } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function DashboardPage() {
  const [, setLocation] = useLocation();
  const { signOut } = useClerk();
  const { toast } = useToast();
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const { data: dashboard, isLoading: isLoadingDash } = useGetDashboard();
  const { data: roomList, isLoading: isLoadingRooms, refetch: refetchRooms } = useListRooms();
  
  const createRoom = useCreateRoom();
  const deleteRoom = useDeleteRoom();

  useEffect(() => {
    if (dashboard && !dashboard.isSubscribed) {
      setLocation("/subscribe");
    }
  }, [dashboard, setLocation]);

  const handleCreateRoom = () => {
    createRoom.mutate(undefined, {
      onSuccess: (newRoom) => {
        toast({
          title: "Room created",
          description: `Room ${newRoom.callCode} is ready.`,
        });
        refetchRooms();
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: "Failed to create room",
          description: "Please try again later.",
        });
      }
    });
  };

  const handleDeleteRoom = (id: string) => {
    deleteRoom.mutate({ id }, {
      onSuccess: () => {
        toast({
          title: "Room deleted",
          description: "The connection has been severed.",
        });
        refetchRooms();
      }
    });
  };

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/call/${code}`);
    setCopiedCode(code);
    toast({
      title: "Link copied",
      description: "Send this link securely to your partner.",
    });
    setTimeout(() => setCopiedCode(null), 2000);
  };

  if (isLoadingDash || isLoadingRooms) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/30 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="Logo" className="w-6 h-6" />
            <span className="font-serif text-lg text-foreground tracking-wide">Frequency</span>
          </div>
          <div className="flex items-center gap-4">
            {dashboard?.isSubscribed && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-mono text-primary">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
                Premium Active
              </div>
            )}
            <Button variant="ghost" size="icon" onClick={() => signOut({ redirectUrl: "/" })} className="text-muted-foreground hover:text-foreground">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <h1 className="text-3xl font-serif text-foreground mb-2">Your Private Rooms</h1>
            <p className="text-muted-foreground font-light">Generate secure, one-time links for intimate conversations.</p>
          </div>
          
          <Button 
            onClick={handleCreateRoom} 
            disabled={createRoom.isPending}
            className="bg-primary hover:bg-secondary text-primary-foreground font-medium rounded-full shadow-[0_0_15px_rgba(194,133,106,0.2)]"
          >
            {createRoom.isPending ? (
              <div className="w-4 h-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin mr-2"></div>
            ) : (
              <Plus className="w-4 h-4 mr-2" />
            )}
            Generate Room
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          <div className="p-5 rounded-2xl bg-card border border-card-border">
            <div className="text-muted-foreground text-xs font-mono uppercase tracking-wider mb-2">Total Rooms</div>
            <div className="text-3xl font-serif text-foreground">{dashboard?.totalRooms || 0}</div>
          </div>
          <div className="p-5 rounded-2xl bg-card border border-card-border">
            <div className="text-muted-foreground text-xs font-mono uppercase tracking-wider mb-2">Active Now</div>
            <div className="text-3xl font-serif text-primary">{dashboard?.activeRooms || 0}</div>
          </div>
        </div>

        {/* Room List */}
        <div className="space-y-4">
          <h2 className="text-sm font-mono uppercase tracking-widest text-muted-foreground mb-4">Active Connections</h2>
          
          {!roomList?.rooms || roomList.rooms.length === 0 ? (
            <div className="py-16 text-center border border-dashed border-border/50 rounded-2xl flex flex-col items-center">
              <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center mb-4">
                <PhoneForwarded className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-foreground font-medium mb-1">Silence.</p>
              <p className="text-sm text-muted-foreground">You have no active rooms. Generate one to begin.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {roomList.rooms.map((room, i) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  key={room.id} 
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
                      {copiedCode === room.callCode ? (
                        <Check className="w-4 h-4 mr-2 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4 mr-2" />
                      )}
                      {copiedCode === room.callCode ? "Copied" : "Copy Link"}
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
        </div>
      </main>
    </div>
  );
}