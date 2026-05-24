import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Peptides',
  description: 'Peptide dose tracking',
  manifest: '/manifest.json',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#4f46e5" />
      </head>
      <body>{children}</body>
    </html>
  );
}
