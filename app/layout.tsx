import '@fontsource/inter-tight/600.css';
import '@fontsource/inter-tight/700.css';
import '@fontsource/inter-tight/800.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: { default: 'BharatM3 — National Material Master', template: '%s · BharatM3' },
  description: 'AI-driven standardisation and harmonisation of material codes across CPSEs — One Nation, One Material Code.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN">
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
