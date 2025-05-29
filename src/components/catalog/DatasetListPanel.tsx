// src/components/catalog/DatasetListPanel.tsx
"use client";

import { useCatalog } from '@/contexts/CatalogProvider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Database, Tag } from 'lucide-react';

export function DatasetListPanel() {
  const { catalog, selectedDataset, selectDataset, isLoading } = useCatalog();

  if (!catalog || catalog.datasets.length === 0) {
    return null; // Parent component handles empty/loading states
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3">
        {catalog.datasets.map((dataset) => (
          <Card
            key={dataset.id}
            className={cn(
              "cursor-pointer hover:shadow-md transition-shadow",
              selectedDataset?.id === dataset.id ? "border-primary ring-2 ring-primary shadow-lg" : "border-border"
            )}
            onClick={() => selectDataset(dataset.name)}
          >
            <CardHeader className="p-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Database size={18} className={selectedDataset?.id === dataset.id ? "text-primary" : "text-muted-foreground"} />
                {dataset.name}
              </CardTitle>
              {dataset.description && (
                <CardDescription className="text-xs line-clamp-2 pt-1">
                  {dataset.description}
                </CardDescription>
              )}
            </CardHeader>
            {(dataset.tags || dataset.source) && (
              <CardContent className="p-4 pt-0 text-xs text-muted-foreground space-y-1">
                {dataset.tags && (
                  <div className="flex items-center gap-1">
                    <Tag size={12} />
                    <span className="line-clamp-1">{dataset.tags}</span>
                  </div>
                )}
                 {dataset.source && <p className="line-clamp-1">Source: {dataset.source}</p>}
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </ScrollArea>
  );
}
