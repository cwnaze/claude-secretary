import type { Metadata, Viewport } from 'next';
import { Public_Sans, Source_Serif_4 } from 'next/font/google';
import './globals.css';

const sans = Public_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-sans', display: 'swap' });
const serif = Source_Serif_4({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-serif', display: 'swap' });

export const metadata: Metadata = {
  title: 'Secretary',
  description: 'Your day, from your Obsidian vault.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#1e2a4a' },
    { media: '(prefers-color-scheme: dark)', color: '#141b30' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
