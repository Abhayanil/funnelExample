import type { Metadata, Viewport } from 'next';
import MetaPixel from '@/components/MetaPixel';
import './globals.css';

export const metadata: Metadata = {
  title: 'LexHive — Disability Benefits Qualification',
  description:
    'Answer a few questions to see whether you may qualify for Social Security disability benefits. Free, confidential, and no obligation.',
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#4c1d95',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <MetaPixel />
      </body>
    </html>
  );
}
