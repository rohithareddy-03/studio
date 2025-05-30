// src/components/shared/Navbar.tsx
"use client";

import Link from 'next/link';
import { Settings, Database, Search, BrainCircuit, Sparkles, ListChecks } from 'lucide-react'; // Added ListChecks
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import React, { useState } from 'react'; // Added useState
import { LogViewer } from './LogViewer'; // Added LogViewer import

export function Navbar() {
  const pathname = usePathname();
  const [isLogViewerOpen, setIsLogViewerOpen] = useState(false);

  const navItems = [
    { href: '/', label: 'Dashboard', icon: Sparkles },
    { href: '/catalog', label: 'Catalog', icon: Database },
    { href: '/admin', label: 'Admin', icon: Settings },
  ];

  return (
    <>
      <nav className="bg-card/80 backdrop-blur-lg border-b border-border/70 sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-2.5 text-xl font-bold text-primary hover:text-primary/90 transition-colors">
              <BrainCircuit size={30} className="stroke-[1.5px]" />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary via-accent to-primary/70">
                DataSage
              </span>
            </Link>

            <div className="flex-1 flex justify-center px-8 lg:px-16">
              <div className="relative w-full max-w-md">
                <Input
                  type="search"
                  placeholder="Global search (coming soon...)"
                  className="bg-background/70 border-border focus:bg-background focus:border-primary transition-colors h-10 pl-10 w-full rounded-full"
                  disabled // Placeholder
                />
                <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            <div className="flex items-center space-x-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center px-3 py-2 rounded-md text-sm font-medium transition-all duration-150 ease-out",
                    "hover:bg-primary/10 hover:text-primary",
                    pathname === item.href || (pathname.startsWith(item.href) && item.href !== '/')
                      ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:text-primary-foreground"
                      : "text-foreground/80"
                  )}
                >
                  <item.icon size={18} className="mr-2 stroke-[1.5px]" />
                  {item.label}
                </Link>
              ))}
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setIsLogViewerOpen(true)}
                className="text-foreground/70 hover:bg-primary/10 hover:text-primary rounded-md h-9 w-9 ml-2"
                title="View Server Logs"
              >
                <ListChecks size={20} className="stroke-[1.5px]" />
              </Button>
            </div>
          </div>
        </div>
      </nav>
      <LogViewer isOpen={isLogViewerOpen} onOpenChange={setIsLogViewerOpen} />
    </>
  );
}
