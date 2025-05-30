
// src/components/admin/SensitivityBadge.tsx
"use client";

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert, ShieldCheck, ShieldQuestion, ShieldOff, LucideIcon } from 'lucide-react'; // Changed Shield to ShieldOff for 'medium'
import type { EnrichedColumn, EnrichedTable, EnrichedDataset } from '@/types';

interface SensitivityBadgeProps {
  level?: EnrichedColumn['sensitivity'] | EnrichedTable['sensitivity'] | EnrichedDataset['sensitivity'];
  size?: 'sm' | 'md';
}

export function SensitivityBadge({ level, size = 'md' }: SensitivityBadgeProps) {
  const normalizedLevel = typeof level === 'string' ? level.toLowerCase() : 'unknown';

  let IconComponent: LucideIcon = ShieldQuestion;
  let badgeColorClass = 'bg-[hsl(var(--sensitivity-unknown))] hover:bg-[hsl(var(--sensitivity-unknown))]';
  let textColorClass = 'text-primary-foreground'; // Assuming dark text on light badges for this theme. Adjust if needed.

  switch (normalizedLevel) {
    case 'low':
      IconComponent = ShieldCheck;
      badgeColorClass = 'bg-[hsl(var(--sensitivity-low))] hover:bg-[hsl(var(--sensitivity-low))]';
      break;
    case 'medium':
      IconComponent = ShieldOff; // Changed to ShieldOff for better visual distinction
      badgeColorClass = 'bg-[hsl(var(--sensitivity-medium))] hover:bg-[hsl(var(--sensitivity-medium))]';
      break;
    case 'high':
      IconComponent = ShieldAlert;
      badgeColorClass = 'bg-[hsl(var(--sensitivity-high))] hover:bg-[hsl(var(--sensitivity-high))]';
      break;
    default: // unknown
      IconComponent = ShieldQuestion;
      badgeColorClass = 'bg-[hsl(var(--sensitivity-unknown))] hover:bg-[hsl(var(--sensitivity-unknown))]';
      break;
  }
  
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';
  const textSize = size === 'sm' ? 'text-[0.65rem]' : 'text-xs';
  const padding = size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-1';


  return (
    <Badge variant="outline" className={cn(
        "capitalize border-none flex items-center gap-1 rounded", 
        badgeColorClass, 
        textColorClass,
        padding,
        textSize
        )}>
      <IconComponent className={cn(iconSize, "stroke-[1.5px]")} />
      <span className="font-medium">{normalizedLevel}</span>
    </Badge>
  );
}

