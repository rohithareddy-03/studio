// src/components/admin/SensitivityBadge.tsx
"use client";

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert, ShieldCheck, ShieldQuestion, Shield } from 'lucide-react';
import type { EnrichedColumn, EnrichedTable, EnrichedDataset } from '@/types';

interface SensitivityBadgeProps {
  level?: EnrichedColumn['sensitivity'] | EnrichedTable['sensitivity'] | EnrichedDataset['sensitivity'];
}

export function SensitivityBadge({ level }: SensitivityBadgeProps) {
  const normalizedLevel = typeof level === 'string' ? level.toLowerCase() : 'unknown';

  const badgeVariant = () => {
    switch (normalizedLevel) {
      case 'low': return 'bg-[hsl(var(--sensitivity-low))] hover:bg-[hsl(var(--sensitivity-low))] text-primary-foreground';
      case 'medium': return 'bg-[hsl(var(--sensitivity-medium))] hover:bg-[hsl(var(--sensitivity-medium))] text-primary-foreground';
      case 'high': return 'bg-[hsl(var(--sensitivity-high))] hover:bg-[hsl(var(--sensitivity-high))] text-primary-foreground';
      default: return 'bg-[hsl(var(--sensitivity-unknown))] hover:bg-[hsl(var(--sensitivity-unknown))] text-primary-foreground';
    }
  };

  const Icon = () => {
    switch (normalizedLevel) {
      case 'low': return <ShieldCheck className="h-3.5 w-3.5" />;
      case 'medium': return <Shield className="h-3.5 w-3.5" />;
      case 'high': return <ShieldAlert className="h-3.5 w-3.5" />;
      default: return <ShieldQuestion className="h-3.5 w-3.5" />;
    }
  };

  return (
    <Badge variant="outline" className={cn("capitalize border-none text-xs px-2 py-1", badgeVariant())}>
      <Icon />
      <span className="ml-1.5">{normalizedLevel}</span>
    </Badge>
  );
}
