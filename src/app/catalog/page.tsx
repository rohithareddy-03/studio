
// src/app/catalog/page.tsx
"use client";

import { useState, useEffect, useMemo } from 'react';
import { useCatalog } from '@/contexts/CatalogProvider';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Database, Table2, Columns, Loader2, AlertTriangle, ChevronRight, PackageSearch, FileText, Tag, Info, CalendarDays, KeyRound, Rows, MapPin, Search } from 'lucide-react';
import { SensitivityBadge } from '@/components/admin/SensitivityBadge';
import { cn } from '@/lib/utils';
import type { EnrichedDataset, EnrichedTable, EnrichedColumn } from '@/types';
import Image from 'next/image'; // For placeholder images
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';


// --- Re-styled Item Components ---

const DatasetListItem = ({ dataset, onSelect, isSelected }: { dataset: EnrichedDataset, onSelect: () => void, isSelected: boolean }) => (
  <button
    onClick={onSelect}
    className={cn(
      "w-full text-left p-3 rounded-lg hover:bg-primary/10 transition-colors flex items-center justify-between group",
      isSelected ? "bg-primary text-primary-foreground shadow-md hover:bg-primary/90" : "bg-card hover:border-primary/20 border border-transparent"
    )}
  >
    <div className="flex items-center gap-3">
      <Database size={20} className={cn(isSelected ? "text-primary-foreground/90" : "text-primary")} />
      <span className={cn("font-semibold text-base", isSelected ? "text-primary-foreground" : "text-foreground")}>{dataset.name}</span>
    </div>
    <ChevronRight size={18} className={cn("text-muted-foreground transition-transform group-hover:translate-x-0.5", isSelected ? "text-primary-foreground/80" : "")} />
  </button>
);

const TableListItem = ({ table, onSelect }: { table: EnrichedTable, onSelect: () => void }) => (
 <Card
    onClick={onSelect}
    className="cursor-pointer hover:shadow-xl hover:border-primary/40 transition-all duration-300 ease-out group bg-card/80 backdrop-blur-sm border-border/60"
  >
    <CardHeader className="p-4">
      <div className="flex items-center justify-between">
        <CardTitle className="text-md font-semibold flex items-center gap-2 text-primary group-hover:text-primary/90">
          <Table2 size={18} />
          {table.name}
        </CardTitle>
        <SensitivityBadge level={table.sensitivity} />
      </div>
      <CardDescription className="text-xs line-clamp-2 mt-1.5 h-8">
        {table.description || "No description available."}
      </CardDescription>
    </CardHeader>
    <CardContent className="p-4 pt-2 text-xs space-y-1.5 text-muted-foreground">
        <div className="flex items-center gap-1.5"><Rows size={14} /> Rows: <span className="font-medium text-foreground/90">{table.rowCount ?? 'N/A'}</span></div>
        {table.tags && <div className="flex items-center gap-1.5"><Tag size={14} /> Tags: <span className="font-medium text-foreground/90 truncate">{table.tags}</span></div>}
    </CardContent>
  </Card>
);

const ColumnListItem = ({ column }: { column: EnrichedColumn }) => (
  <Card className="bg-card/70 backdrop-blur-sm border-border/50">
    <CardHeader className="p-3">
      <div className="flex items-center justify-between">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground/90">
          <Columns size={16} className="text-primary/90" />
          {column.name}
        </CardTitle>
        <SensitivityBadge level={column.sensitivity} />
      </div>
      <CardDescription className="text-xs mt-1">
        Data Type: <span className="font-medium text-foreground/80">{column.dataType || "N/A"}</span>
      </CardDescription>
    </CardHeader>
    <CardContent className="p-3 pt-1.5 text-xs space-y-1.5">
      {column.description && <p className="text-muted-foreground line-clamp-2 h-8">Desc: {column.description}</p>}
      {column.tags && <p className="text-muted-foreground line-clamp-1">Tags: {column.tags}</p>}
      {(column.isPrimaryKey || column.isForeignKey) && (
        <div className="flex gap-2 pt-0.5">
          {column.isPrimaryKey && <Badge variant="outline" className="border-accent text-accent text-[0.7rem] px-1.5 py-0.5">Primary Key</Badge>}
          {column.isForeignKey && <Badge variant="outline" className="border-accent/70 text-accent/70 text-[0.7rem] px-1.5 py-0.5">Foreign Key</Badge>}
        </div>
      )}
    </CardContent>
  </Card>
);

const DetailItem = ({ icon: Icon, label, value, className }: { icon?: React.ElementType, label: string, value?: string | number | null, className?: string }) => (
  value || (typeof value === 'number' && value === 0) ? ( // Show if value is present or is zero
    <div className={cn("text-sm flex items-start gap-2", className)}>
      {Icon && <Icon size={15} className="text-primary/80 mt-0.5 shrink-0" />}
      <div>
        <span className="font-medium text-foreground/70">{label}: </span>
        <span className="text-foreground/90">{String(value)}</span>
      </div>
    </div>
  ) : null
);


export default function CatalogPage() {
  const {
    catalog,
    selectedDataset,
    selectedTable,
    isLoading,
    error,
    selectDataset,
    selectTable,
  } = useCatalog();

  const [datasetFilter, setDatasetFilter] = useState('');
  const [tableFilter, setTableFilter] = useState('');
  const [columnFilter, setColumnFilter] = useState('');

  useEffect(() => {
    // Check for query params to pre-select dataset
    const queryParams = new URLSearchParams(window.location.search);
    const datasetNameFromQuery = queryParams.get('dataset');
    if (datasetNameFromQuery && catalog?.datasets && !selectedDataset) {
        const dsToSelect = catalog.datasets.find(d => d.name === datasetNameFromQuery);
        if (dsToSelect) {
            selectDataset(dsToSelect.name);
        }
    }
  }, [catalog, selectDataset, selectedDataset]);


  const filteredDatasets = useMemo(() => {
    if (!catalog?.datasets) return [];
    return catalog.datasets.filter(d => d.name.toLowerCase().includes(datasetFilter.toLowerCase()));
  }, [catalog, datasetFilter]);

  const filteredTables = useMemo(() => {
    if (!selectedDataset?.tables) return [];
    return selectedDataset.tables.filter(t => t.name.toLowerCase().includes(tableFilter.toLowerCase()));
  }, [selectedDataset, tableFilter]);

  const filteredColumns = useMemo(() => {
    if (!selectedTable?.columns) return [];
    return selectedTable.columns.filter(c => c.name.toLowerCase().includes(columnFilter.toLowerCase()));
  }, [selectedTable, columnFilter]);

  useEffect(() => setTableFilter(''), [selectedDataset]);
  useEffect(() => setColumnFilter(''), [selectedTable]);

  const clearTableSelection = () => selectTable(null);
  const clearDatasetSelection = () => {
    selectDataset(null);
    // Clear query params
    const url = new URL(window.location.href);
    url.searchParams.delete('dataset');
    window.history.pushState({}, '', url.toString());
  };

  if (isLoading && !catalog) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-16rem)]">
        <Loader2 className="h-16 w-16 animate-spin text-primary mb-6" />
        <p className="text-2xl text-muted-foreground font-light">Loading Catalog Universe...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-16rem)] text-destructive p-6 rounded-lg bg-destructive/10 border border-destructive">
        <AlertTriangle size={56} className="mb-5" />
        <p className="text-2xl font-semibold">Error Loading Catalog</p>
        <p className="text-md mt-2">{error}</p>
        <Button onClick={() => window.location.reload()} variant="destructive" className="mt-6">Try Again</Button>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-10rem)] bg-transparent rounded-lg overflow-hidden gap-4">
      {/* Left Panel: Dataset Explorer */}
      <aside className="w-1/3 min-w-[320px] max-w-[400px] bg-card/70 backdrop-blur-sm border border-border/50 rounded-xl flex flex-col shadow-lg">
        <div className="p-4 border-b border-border/50">
          <h2 className="text-xl font-semibold mb-3 text-primary flex items-center gap-2"><Database size={22}/> Datasets</h2>
          <div className="relative">
            <Input
              type="search"
              placeholder="Filter datasets..."
              value={datasetFilter}
              onChange={(e) => setDatasetFilter(e.target.value)}
              className="bg-background/80 border-input focus:border-primary h-10 pl-10 rounded-full"
            />
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        </div>
        <ScrollArea className="flex-1 p-3 space-y-2">
          {filteredDatasets.length > 0 ? (
            filteredDatasets.map(ds => (
              <DatasetListItem
                key={ds.id}
                dataset={ds}
                onSelect={() => selectDataset(ds.name)}
                isSelected={selectedDataset?.id === ds.id}
              />
            ))
          ) : (
            <p className="p-4 text-md text-muted-foreground text-center">No datasets found.</p>
          )}
        </ScrollArea>
      </aside>

      {/* Main Content Panel: Workspace */}
      <main className="flex-1 flex flex-col overflow-y-auto bg-card/70 backdrop-blur-sm border border-border/50 rounded-xl shadow-lg p-1">
        <div className="p-5 space-y-5">
          <Breadcrumb className="mb-2">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="#" onClick={clearDatasetSelection} className={!selectedDataset ? "text-primary font-semibold" : "text-muted-foreground hover:text-primary/80"}>
                  Catalog Explorer
                </BreadcrumbLink>
              </BreadcrumbItem>
              {selectedDataset && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    {selectedTable ? (
                      <BreadcrumbLink href="#" onClick={clearTableSelection} className="text-muted-foreground hover:text-primary/80">
                        {selectedDataset.name}
                      </BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage className="font-semibold text-primary">{selectedDataset.name}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                </>
              )}
              {selectedDataset && selectedTable && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage className="font-semibold text-primary">{selectedTable.name}</BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}
            </BreadcrumbList>
          </Breadcrumb>

          {!selectedDataset && (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-20rem)] text-muted-foreground p-10">
              <PackageSearch size={64} className="mb-6 opacity-50 stroke-1 text-primary/50" />
              <p className="text-2xl font-light">Select a dataset to begin your exploration.</p>
              <p className="text-md mt-2 text-center max-w-md">Dive into your data universe by choosing a dataset from the panel on the left.</p>
            </div>
          )}

          {/* Dataset Focus View */}
          {selectedDataset && !selectedTable && (
            <div className="space-y-5 animate-fadeIn">
              <Card className="bg-card shadow-lg border-border/60">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-2xl font-bold text-primary flex items-center gap-3">
                      <Database size={28}/>{selectedDataset.name}
                    </CardTitle>
                    <SensitivityBadge level={selectedDataset.sensitivity} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  <p className="text-foreground/80 text-sm leading-relaxed">{selectedDataset.description || "No description available."}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 pt-3 border-t border-border/50 mt-3">
                    <DetailItem icon={Tag} label="Tags" value={selectedDataset.tags} />
                    <DetailItem icon={Info} label="Source" value={selectedDataset.source} />
                    <DetailItem icon={MapPin} label="Location" value={selectedDataset.location} />
                  </div>
                </CardContent>
              </Card>

              <section>
                <div className="flex justify-between items-center mb-3.5">
                  <h3 className="text-xl font-semibold text-foreground">Tables ({filteredTables.length})</h3>
                  <div className="relative w-full max-w-xs">
                    <Input
                      type="search"
                      placeholder="Filter tables..."
                      value={tableFilter}
                      onChange={(e) => setTableFilter(e.target.value)}
                      className="bg-background/80 border-input focus:border-primary h-9 pl-9 rounded-full"
                    />
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
                {filteredTables.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filteredTables.map(tbl => (
                      <TableListItem key={tbl.id} table={tbl} onSelect={() => selectTable(tbl.id)} />
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-6">No tables found in this dataset or matching your filter.</p>
                )}
              </section>
            </div>
          )}

          {/* Table Focus View */}
          {selectedDataset && selectedTable && (
            <div className="space-y-5 animate-fadeIn">
              <Card className="bg-card shadow-lg border-border/60">
                <CardHeader className="pb-3">
                   <div className="flex items-center justify-between">
                    <CardTitle className="text-2xl font-bold text-primary flex items-center gap-3">
                      <Table2 size={28}/>{selectedTable.name}
                    </CardTitle>
                    <SensitivityBadge level={selectedTable.sensitivity} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  <p className="text-foreground/80 text-sm leading-relaxed">{selectedTable.description || "No description available."}</p>
                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2.5 pt-3 border-t border-border/50 mt-3">
                      <DetailItem icon={Info} label="Owner" value={selectedTable.owner} />
                      <DetailItem icon={Info} label="Source" value={selectedTable.source} />
                      <DetailItem icon={MapPin} label="Location" value={selectedTable.location} />
                      <DetailItem icon={Database} label="DB Name" value={selectedTable.databaseName} />
                      <DetailItem icon={Info} label="Schema" value={selectedTable.schemaName} />
                      <DetailItem icon={KeyRound} label="Primary Keys" value={selectedTable.primaryKeys} />
                      <DetailItem icon={KeyRound} label="Foreign Keys" value={selectedTable.foreignKeys} />
                      <DetailItem icon={CalendarDays} label="Created" value={selectedTable.createdDate} />
                      <DetailItem icon={CalendarDays} label="Updated" value={selectedTable.updatedDate} />
                      <DetailItem icon={Rows} label="Row Count" value={selectedTable.rowCount} />
                   </div>
                </CardContent>
              </Card>

              <section>
                <div className="flex justify-between items-center mb-3.5">
                  <h3 className="text-xl font-semibold text-foreground">Columns ({filteredColumns.length})</h3>
                   <div className="relative w-full max-w-xs">
                    <Input
                      type="search"
                      placeholder="Filter columns..."
                      value={columnFilter}
                      onChange={(e) => setColumnFilter(e.target.value)}
                      className="bg-background/80 border-input focus:border-primary h-9 pl-9 rounded-full"
                    />
                     <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
                {filteredColumns.length > 0 ? (
                  <div className="space-y-3">
                    {filteredColumns.map(col => (
                      <ColumnListItem key={col.id} column={col} />
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-6">No columns found in this table or matching your filter.</p>
                )}
              </section>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
