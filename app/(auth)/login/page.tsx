import { LoginForm } from './_components/LoginForm';
import { isGoogleOAuthConfigured } from '@/lib/auth/googleOAuth';

interface PageProps {
  searchParams: Promise<{
    email?: string;
    accepted?: string;
    deletionScheduled?: string;
    callbackUrl?: string;
  }>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const email = params.email ?? '';
  const accepted = params.accepted === '1';
  const deletionScheduled = params.deletionScheduled === '1';
  const callbackUrl = params.callbackUrl;
  const googleEnabled = isGoogleOAuthConfigured();

  return (
    <main className="min-h-screen relative flex flex-col items-center justify-center p-4 overflow-hidden bg-gradient-to-b from-background via-background to-muted/10">
      {/* Dynamic Background Glow Circles */}
      <div className="absolute top-[-10%] left-[-10%] w-[45vw] h-[45vw] min-w-[300px] min-h-[300px] rounded-full bg-primary/8 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[45vw] h-[45vw] min-w-[300px] min-h-[300px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />

      {/* Main Container with Entrance Animation */}
      <div className="w-full max-w-md space-y-8 relative z-10 animate-page-enter">
        {/* Logo / Branding */}
        <div className="flex flex-col items-center space-y-3 text-center">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-xl shadow-primary/20 text-primary-foreground font-black text-2xl tracking-wider select-none border border-primary/10">
            P
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-foreground to-foreground/80">
              Welcome to Peptides
            </h1>
            <p className="text-sm text-muted-foreground font-medium">
              Clinical peptide protocol & dose tracking
            </p>
          </div>
        </div>

        {/* Banners */}
        {accepted && (
          <div className="rounded-xl border border-green-200 bg-green-50/50 p-4 dark:border-green-950/30 dark:bg-green-950/20 backdrop-blur-sm shadow-sm transition-all duration-300">
            <div className="flex gap-3">
              <span className="text-green-600 dark:text-green-400 font-bold text-lg leading-none">✓</span>
              <div className="text-sm text-green-800 dark:text-green-300">
                <p className="font-semibold">Invitation accepted successfully</p>
                <p className="mt-0.5 opacity-90">Please sign in below using your password.</p>
              </div>
            </div>
          </div>
        )}

        {deletionScheduled && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-950/30 dark:bg-amber-950/20 backdrop-blur-sm shadow-sm transition-all duration-300">
            <div className="flex gap-3">
              <span className="text-amber-600 dark:text-amber-400 font-bold text-lg leading-none">⚠️</span>
              <div className="text-sm text-amber-800 dark:text-amber-300">
                <p className="font-semibold">Account deletion scheduled</p>
                <p className="mt-0.5 opacity-90">
                  Your account is scheduled for deletion in 48 hours. A JSON export of your data was sent to your email. You can sign in below to cancel this scheduled request.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Styled Glassmorphic Login Card */}
        <div className="bg-card/75 backdrop-blur-md border border-border/80 rounded-2xl shadow-xl p-8 space-y-6">
          <LoginForm
            key={email}
            initialEmail={email}
            callbackUrl={callbackUrl}
            googleEnabled={googleEnabled}
          />
        </div>
      </div>
    </main>
  );
}
