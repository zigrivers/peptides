import { LoginForm } from './_components/LoginForm';

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

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-tr from-background to-muted/20">
      {/* Container */}
      <div className="w-full max-w-md space-y-6">
        {/* Logo / Branding */}
        <div className="flex flex-col items-center space-y-2 text-center">
          <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20 text-primary-foreground font-black text-xl">
            P
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Welcome to Peptides
          </h1>
          <p className="text-sm text-muted-foreground">
            Clinical peptide protocol & dose tracking
          </p>
        </div>

        {/* Banners */}
        {accepted && (
          <div className="rounded-lg border border-green-200 bg-green-50/50 p-4 dark:border-green-950/30 dark:bg-green-950/20">
            <div className="flex gap-2">
              <span className="text-green-600 dark:text-green-400 font-bold">✓</span>
              <div className="text-sm text-green-800 dark:text-green-300">
                <p className="font-semibold">Invitation accepted successfully</p>
                <p className="mt-0.5 opacity-90">Please sign in below using your password.</p>
              </div>
            </div>
          </div>
        )}

        {deletionScheduled && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-950/30 dark:bg-amber-950/20">
            <div className="flex gap-2">
              <span className="text-amber-600 dark:text-amber-400 font-bold">⚠️</span>
              <div className="text-sm text-amber-800 dark:text-amber-300">
                <p className="font-semibold">Account deletion scheduled</p>
                <p className="mt-0.5 opacity-90">
                  Your account is scheduled for deletion in 48 hours. A JSON export of your data was sent to your email. You can sign in below to cancel this scheduled request.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-card border border-border rounded-2xl shadow-xl p-8 space-y-6">
          <LoginForm key={email} initialEmail={email} callbackUrl={callbackUrl} />
        </div>
      </div>
    </main>
  );
}
