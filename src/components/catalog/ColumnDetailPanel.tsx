// src/components/catalog/ColumnDetailPanel.tsx
"use client";

import { useCatalog } from '@/contexts/CatalogProvider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SensitivityBadge } from '@/components/admin/SensitivityBadge';
import { Columns, FileText, Info, Tag, KeyRound, Type, MapPin, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ColumnDetailPanel() {
  const { selectedTable } = useCatalog();

  if (!selectedTable) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
        <Info size={32} className="mb-2" />
        <p>Select a table from the middle panel to see its columns.</p>
      </div>
    );
  }

  if (selectedTable.columns.length === 0) {
     return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4 border border-dashed rounded-md">
        <AlertTriangle size={24} className="mb-2" />
        <p>No columns found in this table.</p>
      </div>
    );
  }

  const DetailItem = ({ icon: Icon, label, value, isBadge = false }: { icon: React.ElementType, label?: string, value?: string | number | null | boolean, isBadge?: boolean }) => (
    value || isBadge ? (
      <div className={cn("flex items-center text-xs space-x-1.5 py-0.5", label ? "items-start" : "")}>
        <Icon size={12} className="text-primary mt-0.5 shrink-0" />
        <div>
          {label && <span className="font-medium text-foreground/80">{label}: </span>}
          {isBadge && typeof value === 'string' ? <SensitivityBadge level={value} /> : <span className="text-muted-foreground break-words">{value === true ? "Yes" : value === false ? "No" : String(value)}</span>}
        </div>
      </div>
    ) : null
  );


  return (
    <ScrollArea className="h-full">
      <div className="space-y-3">
        {selectedTable.columns.map((column) => (
          <Card key={column.id} className="bg-background/30">
            <CardHeader className="p-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Columns size={16} className="text-primary/90" />
                {column.name}
              </CardTitle>
              {column.description && (
                <CardDescription className="text-xs line-clamp-3 pt-0.5">
                  {column.description}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="p-3 pt-0 grid grid-cols-1 gap-y-0.5">
              <DetailItem icon={Type} label="Data Type" value={column.dataType} />
              <DetailItem icon={Tag} label="Tags" value={column.tags} />
              <DetailItem icon={MapPin} label="Location" value={column.location} />
              <div className="flex items-center gap-1 text-xs">
                <Info size={12} className="text-primary mt-0.5 shrink-0" />
                <span className="font-medium text-foreground/80">Sensitivity: </span>
                <SensitivityBadge level={column.sensitivity} />
              </div>
              {column.isPrimaryKey && <DetailItem icon={KeyRound} value="Primary Key" />}
              {column.isForeignKey && <DetailItem icon={KeyRound} value="Foreign Key" />}
            </CardContent>
          </Card>
        ))}
      </div>
    </ScrollArea>
  );
}
