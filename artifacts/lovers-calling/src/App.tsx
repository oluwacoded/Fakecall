import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes'; 
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useSyncMe } from "@workspace/api-client-react";

import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import LandingPage from "./pages/LandingPage";
import DashboardPage from "./pages/DashboardPage";
import CallRoomPage from "./pages/CallRoomPage";
import TokensPage from "./pages/TokensPage";
import NotFound from "./pages/not-found";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(18 43% 59%)",
    colorForeground: "hsl(35 66% 98%)",
    colorMutedForeground: "hsl(270 10% 65%)",
    colorDanger: "hsl(0 62.8% 30.6%)",
    colorBackground: "hsl(270 23% 7%)",
    colorInput: "hsl(273 16% 15%)",
    colorInputForeground: "hsl(35 66% 98%)",
    colorNeutral: "hsl(273 16% 18%)",
    fontFamily: "'Inter', sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#120e15] rounded-2xl w-[440px] max-w-full overflow-hidden border border-[#2b2131]",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#fdfaf5] font-serif text-2xl",
    headerSubtitle: "text-[#a39aa6]",
    socialButtonsBlockButtonText: "text-[#fdfaf5]",
    formFieldLabel: "text-[#fdfaf5]",
    footerActionLink: "text-[#c2856a] hover:text-[#d4a96a]",
    footerActionText: "text-[#a39aa6]",
    dividerText: "text-[#a39aa6]",
    identityPreviewEditButton: "text-[#c2856a]",
    formFieldSuccessText: "text-[#c2856a]",
    alertText: "text-[#fdfaf5]",
    logoBox: "flex justify-center mb-4",
    logoImage: "w-12 h-12",
    socialButtonsBlockButton: "border-[#2b2131] hover:bg-[#1b1520] transition-colors",
    formButtonPrimary: "bg-[#c2856a] hover:bg-[#d4a96a] text-[#0d0a10] font-medium transition-colors",
    formFieldInput: "bg-[#1f1825] border-[#2b2131] text-[#fdfaf5] focus:ring-[#c2856a] focus:border-[#c2856a]",
    footerAction: "bg-[#1b1520] p-4 flex justify-center w-full",
    dividerLine: "bg-[#2b2131]",
    alert: "bg-[#1f1825] border border-[#2b2131]",
    otpCodeFieldInput: "bg-[#1f1825] border-[#2b2131] text-[#fdfaf5]",
    formFieldRow: "mb-4",
    main: "p-8",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 bg-[url('/attached_assets/generated_images/hero-bg.jpg')] bg-cover bg-center">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-0"></div>
      <div className="relative z-10 w-full flex justify-center">
        <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
      </div>
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 bg-[url('/attached_assets/generated_images/hero-bg.jpg')] bg-cover bg-center">
       <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-0"></div>
       <div className="relative z-10 w-full flex justify-center">
        <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
       </div>
    </div>
  );
}

function UserSyncer({ children }: { children: React.ReactNode }) {
  const { user, isLoaded, isSignedIn } = useUser();
  const syncMe = useSyncMe();
  const syncedRef = useRef(false);

  useEffect(() => {
    if (isLoaded && isSignedIn && user && !syncedRef.current) {
      syncedRef.current = true;
      syncMe.mutate({
        data: {
          email: user.primaryEmailAddress?.emailAddress || "",
          name: user.fullName
        }
      });
    }
  }, [isLoaded, isSignedIn, user, syncMe]);

  return <>{children}</>;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <LandingPage />
      </Show>
    </>
  );
}

function ProtectedRoute({ component: Component, requireSub = false }: { component: React.ComponentType, requireSub?: boolean }) {
  return (
    <UserSyncer>
      <Show when="signed-in">
        <Component />
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </UserSyncer>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

const queryClient = new QueryClient();

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Re-enter the Frequency",
            subtitle: "Sign in to access your private rooms",
          },
        },
        signUp: {
          start: {
            title: "Join the Frequency",
            subtitle: "Start speaking in absolute privacy",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route path="/dashboard" component={() => <ProtectedRoute component={DashboardPage} />} />
            <Route path="/tokens" component={() => <ProtectedRoute component={TokensPage} />} />
            <Route path="/call/:code" component={() => <ProtectedRoute component={CallRoomPage} />} />
            <Route component={NotFound} />
          </Switch>
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <>
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
      <Toaster />
    </>
  );
}

export default App;
