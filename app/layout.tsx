import type { Metadata } from 'next';
import './globals.css';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/shared/prisma';
import { cookies } from 'next/headers';
import { SUPPORTED_THEMES, SUPPORTED_ACCENTS } from '@/lib/shared/personalization';

export const metadata: Metadata = {
  title: 'Peptides',
  description: 'Peptide dose tracking',
  manifest: '/manifest.json',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const userId = session?.user?.id;

  let accentColor = 'indigo';
  let theme = 'system';
  let version = 1;

  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { accentColor: true, theme: true, personalizationVersion: true },
    });
    if (user) {
      accentColor = user.accentColor ?? 'indigo';
      theme = user.theme ?? 'system';
      version = user.personalizationVersion ?? 1;
    }
  } else {
    // Unauthenticated user: read from validated cookies
    const cookieStore = await cookies();
    const themeVal = cookieStore.get('theme')?.value;
    const accentVal = cookieStore.get('accent')?.value;

    if (themeVal && (SUPPORTED_THEMES as readonly string[]).includes(themeVal)) {
      theme = themeVal;
    }
    if (accentVal && (SUPPORTED_ACCENTS as readonly string[]).includes(accentVal)) {
      accentColor = accentVal;
    }
  }

  return (
    <html
      lang="en"
      data-accent={accentColor}
      data-theme={theme}
      data-personalization-version={version}
      suppressHydrationWarning
    >
      <head>
        <meta name="theme-color" content="#4f46e5" />
      </head>
      <body>{children}</body>
    </html>
  );
}
