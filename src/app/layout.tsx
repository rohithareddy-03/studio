import type {Metadata} from 'next';
import { Geist, Geist_Mono } from 'next/font/google'; // Corrected import name
import './globals.css';
import { CatalogProvider } from '@/contexts/CatalogProvider';
import { Navbar } from '@/components/shared/Navbar';
import { Toaster } from "@/components/ui/toaster"; // Corrected import path

const geistSans = Geist({ // Corrected variable name
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({ // Corrected variable name
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'DataSage Chat',
  description: 'AI-Powered Data Catalog Assistant with Metadata Enrichment',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased flex flex-col min-h-screen`}>
        <CatalogProvider>
          <Navbar />
          <main className="flex-grow container mx-auto px-4 py-8">
            {children}
          </main>
          <Toaster />
        </CatalogProvider>
      </body>
    </html>
  );
}
