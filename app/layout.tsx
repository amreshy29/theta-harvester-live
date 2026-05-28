import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Theta Harvester — NSE Paper Trading',
  description: '₹5L institutional options selling system with Fyers live data',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: '#070c10' }}>{children}</body>
    </html>
  );
}
