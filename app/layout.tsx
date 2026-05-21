import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Peptides',
  description: 'Peptide dose tracking',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
