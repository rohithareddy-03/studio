
// src/components/admin/MetadataTreeView.tsx
"use client";

import { useCatalog } from '@/contexts/CatalogProvider';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Loader2, DatabaseZap, Table2, Columns, Tag, FileText, AlertTriangle, Info, CalendarDays, KeyRound, Rows, MapPin } from 'lucide-react';
import { SensitivityBadge } from './SensitivityBadge';
import type { EnrichedDataset, EnrichedTable, EnrichedColumn } from '@/types';

export function MetadataTreeView() {
  const { catalog, isLoading, reEnrich } = useCatalog();

  const handleDownload = async () => {
    try {
      const response = await fetch('/api/catalog/download');
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'enriched_catalog.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download error:", error);
      // Consider adding a toast notification for download failure
    }
  };

  if (isLoading && !catalog) {
    return (
      <div className="flex items-center justify-center p-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-lg">Loading catalog...</span>
      </div>
    );
  }

  if (!catalog || catalog.datasets.length === 0) {
    return (
      <Card className="mt-6 border-border bg-transparent"> {/* Updated card styling */}
        <CardHeader>
          <CardTitle>No Metadata Available</CardTitle>
          <CardDescription>Upload an Excel file to populate the catalog.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const DetailItem = ({ icon: Icon, label, value }: { icon: React.ElementType, label: string, value?: string | number | null }) => (
    value ? (
      <div className="flex items-start text-sm text-muted-foreground space-x-2 py-0.5"> {/* Added small py for better spacing */}
        <Icon size={14} className="text-primary mt-0.5 shrink-0" />
        <div>
          <span className="font-medium text-foreground/80">{label}:</span> {/* Slightly less prominent label color */}
          <span className="ml-1">{value}</span>
        </div>
      </div>
    ) : null
  );
  

  return (
    <Card className="mt-6 border-border"> {/* Removed shadow-lg */}
      <CardHeader className="flex flex-row justify-between items-center border-b border-border pb-4"> {/* Added border-b */}
        <div>
          <CardTitle className="text-2xl">Enriched Data Catalog</CardTitle>
          <CardDescription>Browse datasets, tables, and columns with their enriched metadata.</CardDescription>
        </div>
        <div className="space-x-2">
           <Button onClick={reEnrich} variant="outline" disabled={isLoading}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DatabaseZap className="mr-2 h-4 w-4" />}
            Re-enrich Catalog
          </Button>
          <Button onClick={handleDownload} variant="default">
            <Download className="mr-2 h-4 w-4" />
            Download Enriched Data
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6"> {/* Adjusted padding */}
        <Accordion type="multiple" className="w-full">
          {catalog.datasets.map((dataset: EnrichedDataset) => (
            <AccordionItem value={dataset.id} key={dataset.id} className="border-b border-border last:border-b-0"> {/* Ensure last item has no bottom border */}
              <AccordionTrigger className="hover:bg-secondary/50 px-4 py-3 text-lg font-semibold rounded-t-md data-[state=closed]:rounded-b-md"> {/* Cleaner hover, rounded on close */}
                <div className="flex items-center gap-3">
                  <DatabaseZap size={20} className="text-primary" /> 
                  {dataset.name} 
                  <SensitivityBadge level={dataset.sensitivity} />
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 py-3 bg-secondary/30 rounded-b-md data-[state=closed]:border-none"> {/* Removed border on closed content for cleaner look */}
                <div className="space-y-1.5 mb-4 pl-2 border-l-2 border-primary/30"> {/* Adjusted spacing */}
                  <DetailItem icon={FileText} label="Description" value={dataset.description} />
                  <DetailItem icon={Tag} label="Tags" value={dataset.tags} />
                  <DetailItem icon={Info} label="Source" value={dataset.source} />
                  <DetailItem icon={MapPin} label="Location" value={dataset.location} />
                </div>
                
                {dataset.tables.length > 0 ? (
                  <Accordion type="multiple" className="w-full space-y-2"> {/* Added space-y for separation */}
                    {dataset.tables.map((table: EnrichedTable) => (
                      <AccordionItem value={table.id} key={table.id} className="border border-border rounded-md bg-card"> {/* Removed shadow-sm, use bg-card */}
                        <AccordionTrigger className="hover:bg-secondary/50 px-3 py-2 text-md font-medium rounded-t-md data-[state=closed]:rounded-b-md">
                           <div className="flex items-center gap-2">
                            <Table2 size={18} className="text-primary/80" />
                            {table.name}
                            <SensitivityBadge level={table.sensitivity} />
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-3 py-2 bg-secondary/20 rounded-b-md data-[state=closed]:border-none">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1.5 mb-3 pl-2 border-l-2 border-primary/20"> {/* Adjusted spacing */}
                            <DetailItem icon={FileText} label="Description" value={table.description} />
                            <DetailItem icon={Tag} label="Tags" value={table.tags} />
                            <DetailItem icon={Info} label="Source" value={table.source} />
                            <DetailItem icon={MapPin} label="Location" value={table.location} />
                            <DetailItem icon={Info} label="DB Name" value={table.databaseName} />
                            <DetailItem icon={Info} label="Schema" value={table.schemaName} />
                            <DetailItem icon={Info} label="Owner" value={table.owner} />
                            <DetailItem icon={KeyRound} label="Primary Keys" value={table.primaryKeys} />
                            <DetailItem icon={KeyRound} label="Foreign Keys" value={table.foreignKeys} />
                            <DetailItem icon={CalendarDays} label="Created" value={table.createdDate} />
                            <DetailItem icon={CalendarDays} label="Updated" value={table.updatedDate} />
                            <DetailItem icon={Rows} label="Row Count" value={table.rowCount} />
                          </div>

                          {table.columns.length > 0 ? (
                             <Accordion type="multiple" className="w-full space-y-1"> {/* Added space-y */}
                                {table.columns.map((column: EnrichedColumn) => (
                                <AccordionItem value={column.id} key={column.id} className="border border-border/70 rounded-md bg-card/80"> {/* Removed shadow-xs */}
                                    <AccordionTrigger className="hover:bg-secondary/30 px-2 py-1.5 text-sm rounded-t-md data-[state=closed]:rounded-b-md">
                                    <div className="flex items-center gap-2">
                                        <Columns size={16} className="text-primary/70" />
                                        {column.name} ({column.dataType})
                                        <SensitivityBadge level={column.sensitivity} />
                                    </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="px-2 py-1.5 text-xs bg-secondary/10 rounded-b-md data-[state=closed]:border-none">
                                      <div className="space-y-0.5 pl-1.5 border-l-2 border-primary/10"> {/* Adjusted spacing */}
                                        <DetailItem icon={FileText} label="Description" value={column.description} />
                                        <DetailItem icon={Tag} label="Tags" value={column.tags} />
                                        <DetailItem icon={MapPin} label="Location" value={column.location} />
                                        {column.isPrimaryKey && <DetailItem icon={KeyRound} label="Primary Key" value="Yes" />}
                                        {column.isForeignKey && <DetailItem icon={KeyRound} label="Foreign Key" value="Yes" />}
                                      </div>
                                    </AccordionContent>
                                </AccordionItem>
                                ))}
                            </Accordion>
                          ) : (<p className="text-sm text-muted-foreground italic ml-2">No columns in this table.</p>)}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                ) : (<p className="text-sm text-muted-foreground italic ml-2">No tables in this dataset.</p>)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}
