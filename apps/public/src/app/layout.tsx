import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Subreddit Sentiment Analyzer',
  description: 'Auditable, reproducible reports about subreddit language signals',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
