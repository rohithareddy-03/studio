
// src/components/shared/Navbar.tsx
"use client";

import Link from 'next/link';
import { MessageSquareText, ShieldEllipsis, Settings } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function Navbar() {
  const pathname = usePathname();

  const navItems = [
    { href: '/', label: 'Chat', icon: MessageSquareText },
    { href: '/admin', label: 'Admin', icon: Settings },
  ];

  return (
    <nav className="bg-card border-b border-border sticky top-0 z-50"> {/* Removed shadow-sm */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8"> {/* Consistent padding with layout */}
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2 text-xl font-semibold text-primary">
            <ShieldEllipsis size={28} />
            <span>DataSage Chat</span>
          </Link>
          <div className="flex items-center space-x-1 sm:space-x-2"> {/* Reduced space for a tighter group */}
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  pathname === item.href
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground/70 hover:bg-accent/10 hover:text-accent-foreground" // Subtle hover, stronger active state
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
