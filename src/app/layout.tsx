import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Brivel — The Quiet Tide',
  description:
    'A quiet place for stories that stay with you. Brivel private chapter reader validation.',
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
