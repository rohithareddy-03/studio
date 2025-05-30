
// src/components/chat/DatasetSelector.tsx
"use client";

import { useCatalog } from '@/contexts/CatalogProvider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, Database } from 'lucide-react';

export function DatasetSelector() {
  const { catalog, selectedDataset, selectDataset, isLoading } = useCatalog();

  if (isLoading && !catalog) {
    return (
      <div className="flex items-center space-x-2 py-2 px-1">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Loading datasets...</span>
      </div>
    );
  }

  if (!catalog || catalog.datasets.length === 0) {
    return <p className="py-2 px-1 text-sm text-muted-foreground">No datasets. Upload in Admin.</p>;
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor="dataset-select" className="text-xs font-medium text-muted-foreground px-1">CONTEXT DATASET</Label>
      <Select
        value={selectedDataset?.name || ""}
        onValueChange={(value) => selectDataset(value || null)}
        disabled={isLoading}
      >
        <SelectTrigger id="dataset-select" className="w-full h-10 rounded-md bg-background/80 hover:border-primary/50">
          <div className="flex items-center gap-2">
            <Database size={16} className="text-primary/80" />
            <SelectValue placeholder="Choose a dataset..." />
          </div>
        </SelectTrigger>
        <SelectContent className="bg-popover border-border shadow-xl">
          {catalog.datasets.map((dataset) => (
            <SelectItem key={dataset.id} value={dataset.name} className="hover:bg-primary/10 focus:bg-primary/10">
              {dataset.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
