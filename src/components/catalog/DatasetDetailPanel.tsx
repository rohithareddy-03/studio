// src/components/catalog/DatasetDetailPanel.tsx
"use client";

import { useCatalog } from '@/contexts/CatalogProvider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Download, DatabaseZap, Loader2, Table2, Tag, FileText, Info, MapPin, Rows, KeyRound, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SensitivityBadge } from '@/components/admin/SensitivityBadge'; // Reusing this

export function DatasetDetailPanel() {
  const { selectedDataset, selectedTable, selectTable, isLoading, reEnrich } = useCatalog();

  if (!selectedDataset) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
        <Info size={32} className="mb-2" />
        <p>Select a dataset from the left panel to see its details and tables.</p>
      </div>
    );
  }
  
  const DetailItem = ({ icon: Icon, label, value, isBadge = false }: { icon: React.ElementType, label: string, value?: string | number | null, isBadge?: boolean }) => (
    value || isBadge ? (
      <div className="flex items-start text-sm space-x-2 py-1">
        <Icon size={14} className="text-primary mt-0.5 shrink-0" />
        <div className="flex-1">
          <span className="font-medium text-foreground/90">{label}:</span>
          {isBadge && typeof value === 'string' ? <SensitivityBadge level={value} /> : <span className="ml-1 text-muted-foreground break-words">{value}</span>}
        </div>
      </div>
    ) : null
  );

  return (
    <ScrollArea className="h-full">
      <div className="space-y-6">
        {/* Dataset Details Card */}
        <Card className="bg-background/50">
          <CardHeader className="p-4">
            <CardTitle className="text-lg">Dataset Information</CardTitle>
          </CardHeader>
          <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0">
            <DetailItem icon={FileText} label="Description" value={selectedDataset.description} />
            <DetailItem icon={Tag} label="Tags" value={selectedDataset.tags} />
            <DetailItem icon={Info} label="Source" value={selectedDataset.source} />
            <DetailItem icon={MapPin} label="Location" value={selectedDataset.location} />
            <DetailItem icon={Info} label="Sensitivity" value={selectedDataset.sensitivity} isBadge />
          </CardContent>
        </Card>

        {/* Tables List */}
        <div>
          <h3 className="text-md font-semibold mb-3 px-1">Tables in {selectedDataset.name}</h3>
          {selectedDataset.tables.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-muted-foreground p-4 border border-dashed rounded-md">
              <AlertTriangle size={24} className="mb-2" />
              <p>No tables found in this dataset.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {selectedDataset.tables.map((table) => (
                <Card
                  key={table.id}
                  className={cn(
                    "cursor-pointer hover:shadow-md transition-shadow",
                    selectedTable?.id === table.id ? "border-primary ring-2 ring-primary shadow-lg" : "border-border"
                  )}
                  onClick={() => selectTable(table.id)}
                >
                  <CardHeader className="p-3">
                    <CardTitle className="text-base flex items-center gap-2">
                       <Table2 size={16} className={selectedTable?.id === table.id ? "text-primary" : "text-muted-foreground"} />
                      {table.name}
                    </CardTitle>
                     <CardDescription className="text-xs line-clamp-2 pt-0.5">
                        {table.description || "No description"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 text-xs text-muted-foreground space-y-0.5">
                    <div className="flex items-center gap-1"><Rows size={12}/> Rows: {table.rowCount || 'N/A'}</div>
                    <div className="flex items-center gap-1"><MapPin size={12}/> Location: {table.location || 'N/A'}</div>
                    <div className="flex items-center gap-1">
                        <Info size={12}/> Sensitivity: <SensitivityBadge level={table.sensitivity} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}
