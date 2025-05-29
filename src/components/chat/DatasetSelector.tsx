// src/components/chat/DatasetSelector.tsx
"use client";

import { useCatalog } from '@/contexts/CatalogProvider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

export function DatasetSelector() {
  const { catalog, selectedDataset, selectDataset, isLoading } = useCatalog();

  if (isLoading && !catalog) {
    return (
      <div className="flex items-center space-x-2 p-4">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span>Loading datasets...</span>
      </div>
    );
  }

  if (!catalog || catalog.datasets.length === 0) {
    return <p className="p-4 text-muted-foreground">No datasets available. Please upload a catalog in the Admin section.</p>;
  }

  return (
    <div className="p-4 space-y-2 border-b md:border-r md:border-b-0">
      <Label htmlFor="dataset-select" className="text-sm font-medium">Select Dataset</Label>
      <Select
        value={selectedDataset?.name || ""}
        onValueChange={(value) => selectDataset(value || null)}
        disabled={isLoading}
      >
        <SelectTrigger id="dataset-select" className="w-full">
          <SelectValue placeholder="Choose a dataset..." />
        </SelectTrigger>
        <SelectContent>
          {catalog.datasets.map((dataset) => (
            <SelectItem key={dataset.id} value={dataset.name}>
              {dataset.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedDataset && (
        <p className="text-xs text-muted-foreground pt-1">
          {selectedDataset.description || "No description for this dataset."}
        </p>
      )}
    </div>
  );
}
