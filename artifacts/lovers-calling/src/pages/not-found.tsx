export default function NotFound() {
  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center bg-background text-center px-6">
      <div className="w-16 h-16 rounded-full border border-primary/30 flex items-center justify-center mb-6">
        <div className="w-12 h-12 rounded-full border-2 border-primary/50 flex items-center justify-center animate-pulse">
          <div className="w-2 h-2 rounded-full bg-primary"></div>
        </div>
      </div>
      
      <h1 className="text-3xl font-serif text-foreground mb-4">Frequency Lost</h1>
      <p className="text-muted-foreground font-light max-w-md mb-8">
        The page you are looking for has disconnected from the server. It may have been a temporary link that has since expired.
      </p>
      
      <a 
        href="/" 
        className="px-6 py-3 rounded-full border border-primary text-primary hover:bg-primary/10 transition-colors font-mono text-sm tracking-widest uppercase"
      >
        Return Home
      </a>
    </div>
  );
}
