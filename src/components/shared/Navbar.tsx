
// src/components/shared/Navbar.tsx
"use client";

import Link from 'next/link';
import { MessageSquareText, Settings, Database, Search, BrainCircuit } from 'lucide-react'; // Ensured BrainCircuit is imported
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function Navbar() {
  const pathname = usePathname();

  const navItems = [
    { href: '/', label: 'Chat', icon: MessageSquareText },
    { href: '/catalog', label: 'Catalog', icon: Database },
    { href: '/admin', label: 'Admin', icon: Settings },
  ];

  return (
    <nav className="bg-background border-b border-border sticky top-0 z-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2 text-xl font-semibold text-primary hover:text-primary/80 transition-colors">
            <BrainCircuit size={28} /> {/* Replaced ShieldEllipsis with BrainCircuit */}
            <span>DataSage</span>
          </Link>

          {/* Global Search - Placeholder */}
          <div className="hidden md:flex items-center space-x-2 flex-grow max-w-xs lg:max-w-sm ml-8">
            <Input
              type="search"
              placeholder="Search datasets..."
              className="bg-secondary border-border focus:bg-background focus:border-primary transition-colors"
              disabled // Placeholder
            />
            <Button variant="ghost" size="icon" disabled className="text-muted-foreground">
              <Search size={18}/>
            </Button>
          </div>

          <div className="flex items-center space-x-1 sm:space-x-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  "hover:bg-secondary hover:text-primary",
                  pathname === item.href || (pathname.startsWith(item.href) && item.href !== '/')
                    ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                    : "text-foreground/70"
                )}
              >
                <item.icon size={18} className="mr-2" />
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
