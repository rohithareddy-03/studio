
import type {Metadata} from 'next';
import { Geist, Geist_Mono } from 'next/font/google'; 
import './globals.css';
import { CatalogProvider } from '@/contexts/CatalogProvider';
import { Navbar } from '@/components/shared/Navbar';
import { Toaster } from "@/components/ui/toaster"; 

const geistSans = Geist({ 
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({ 
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'DataSage - CyberClear Edition',
  description: 'AI-Powered Data Catalog with a Futuristic Interface',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased flex flex-col min-h-screen bg-background`}>
        <CatalogProvider>
          <Navbar />
          <main className="flex-grow container mx-auto px-4 py-8 sm:px-6 lg:px-8"> {/* Increased py */}
            {children}
          </main>
          <Toaster />
        </CatalogProvider>
      </body>
    </html>
  );
}
