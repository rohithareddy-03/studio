
// src/app/catalog/page.tsx
"use client";

import { useState, useEffect, useMemo } from 'react';
import { useCatalog } from '@/contexts/CatalogProvider';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Database, Table2, Columns, Loader2, AlertTriangle, ChevronRight, PackageSearch } from 'lucide-react';
import { SensitivityBadge } from '@/components/admin/SensitivityBadge';
import { cn } from '@/lib/utils';
import type { EnrichedDataset, EnrichedTable, EnrichedColumn } from '@/types';

// New Item Components for the lists
const DatasetListItem = ({ dataset, onSelect, isSelected }: { dataset: EnrichedDataset, onSelect: () => void, isSelected: boolean }) => (
  <button
    onClick={onSelect}
    className={cn(
      "w-full text-left p-3 rounded-md hover:bg-secondary transition-colors flex items-center justify-between group",
      isSelected ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-transparent"
    )}
  >
    <div className="flex items-center gap-3">
      <Database size={18} className={cn(isSelected ? "text-primary-foreground/80" : "text-primary")} />
      <span className={cn("font-medium", isSelected ? "text-primary-foreground" : "text-foreground")}>{dataset.name}</span>
    </div>
    <ChevronRight size={16} className={cn("text-muted-foreground transition-transform group-hover:translate-x-1", isSelected ? "text-primary-foreground/70" : "")} />
  </button>
);

const TableListItem = ({ table, onSelect }: { table: EnrichedTable, onSelect: () => void }) => (
 <Card
    onClick={onSelect}
    className="cursor-pointer hover:shadow-lg transition-shadow bg-card hover:border-primary/50"
  >
    <CardHeader className="p-4">
      <CardTitle className="text-base flex items-center gap-2">
        <Table2 size={16} className="text-primary" />
        {table.name}
      </CardTitle>
      <CardDescription className="text-xs line-clamp-2 mt-1">
        {table.description || "No description available."}
      </CardDescription>
    </CardHeader>
    <CardContent className="p-4 pt-2 text-xs space-y-1.5 text-muted-foreground"> {/* Adjusted pt and space-y */}
        <div className="flex items-center gap-1.5">Rows: {table.rowCount ?? 'N/A'}</div>
        <div className="flex items-center gap-1.5">Sensitivity: <SensitivityBadge level={table.sensitivity} /></div>
    </CardContent>
  </Card>
);

const ColumnListItem = ({ column }: { column: EnrichedColumn }) => (
  <Card className="bg-card border-border/70">
    <CardHeader className="p-3">
      <CardTitle className="text-sm font-medium flex items-center gap-2">
        <Columns size={14} className="text-primary/80" />
        {column.name}
      </CardTitle>
      <CardDescription className="text-xs mt-0.5"> {/* Adjusted mt */}
        Data Type: {column.dataType || "N/A"}
      </CardDescription>
    </CardHeader>
    <CardContent className="p-3 pt-1.5 text-xs space-y-1"> {/* Adjusted pt */}
      {column.description && <p className="text-muted-foreground line-clamp-2">Desc: {column.description}</p>}
      <div className="flex items-center gap-1.5">Sensitivity: <SensitivityBadge level={column.sensitivity} /></div>
      {(column.isPrimaryKey || column.isForeignKey) && (
        <div className="flex gap-2 pt-0.5"> {/* Added pt */}
          {column.isPrimaryKey && <span className="text-accent font-medium">PK</span>}
          {column.isForeignKey && <span className="text-accent font-medium">FK</span>}
        </div>
      )}
    </CardContent>
  </Card>
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

  // Memoized filtered lists
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

  // Reset filters when selections change
  useEffect(() => setTableFilter(''), [selectedDataset]);
  useEffect(() => setColumnFilter(''), [selectedTable]);

  // Handle back navigation for breadcrumbs or clearing selections
  const clearTableSelection = () => selectTable(null);
  const clearDatasetSelection = () => selectDataset(null); 

  if (isLoading && !catalog) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-14rem)]"> {/* Adjusted height */}
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-xl text-muted-foreground">Loading Catalog...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-14rem)] text-destructive"> {/* Adjusted height */}
        <AlertTriangle size={48} className="mb-4" />
        <p className="text-xl">Error loading catalog</p>
        <p className="text-sm">{error}</p>
      </div>
    );
  }
  
  const DetailItem = ({ label, value }: { label: string, value?: string | number | null }) => (
    value ? (
      <div className="text-sm">
        <span className="font-medium text-foreground/80">{label}: </span>
        <span className="text-muted-foreground">{String(value)}</span>
      </div>
    ) : null
  )

  return (
    <div className="flex h-[calc(100vh-8rem)] border border-border bg-background rounded-lg overflow-hidden"> {/* Adjusted height */}
      {/* Left Panel: Dataset Explorer */}
      <aside className="w-1/4 min-w-[280px] max-w-[350px] bg-secondary/50 border-r border-border flex flex-col"> {/* Increased max-w slightly */}
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-semibold mb-3 text-foreground">Datasets</h2>
          <Input
            type="search"
            placeholder="Filter datasets..."
            value={datasetFilter}
            onChange={(e) => setDatasetFilter(e.target.value)}
            className="bg-background border-input focus:border-primary h-9" // Adjusted height
          />
        </div>
        <ScrollArea className="flex-1 p-2"> {/* Adjusted padding */}
          {filteredDatasets.length > 0 ? (
            <div className="space-y-1">
              {filteredDatasets.map(ds => (
                <DatasetListItem
                  key={ds.id}
                  dataset={ds}
                  onSelect={() => selectDataset(ds.name)}
                  isSelected={selectedDataset?.id === ds.id}
                />
              ))}
            </div>
          ) : (
            <p className="p-4 text-sm text-muted-foreground text-center">No datasets found.</p>
          )}
        </ScrollArea>
      </aside>

      {/* Main Content Panel: Workspace */}
      <main className="flex-1 flex flex-col overflow-y-auto">
        <div className="p-6 space-y-6">
          {/* Breadcrumbs */}
          <Breadcrumb className="mb-4"> {/* Added mb */}
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="#" onClick={clearDatasetSelection} className={!selectedDataset ? "text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"}>
                  Catalog
                </BreadcrumbLink>
              </BreadcrumbItem>
              {selectedDataset && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    {selectedTable ? (
                      <BreadcrumbLink href="#" onClick={clearTableSelection} className="text-muted-foreground hover:text-foreground">
                        {selectedDataset.name}
                      </BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage className="font-semibold text-foreground">{selectedDataset.name}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                </>
              )}
              {selectedDataset && selectedTable && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage className="font-semibold text-foreground">{selectedTable.name}</BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}
            </BreadcrumbList>
          </Breadcrumb>

          {!selectedDataset && (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-18rem)] text-muted-foreground"> {/* Adjusted height */}
              <PackageSearch size={56} className="mb-5 opacity-50" /> {/* Changed Icon */}
              <p className="text-xl">Select a dataset to view its details.</p>
              <p className="text-sm mt-1">Explore your data catalog by choosing a dataset from the left panel.</p>
            </div>
          )}

          {/* Dataset Focus View */}
          {selectedDataset && !selectedTable && (
            <div className="space-y-6"> {/* Adjusted spacing */}
              <Card className="bg-card shadow-none border-border">
                <CardHeader>
                  <CardTitle className="text-2xl font-bold text-primary">{selectedDataset.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-foreground/90">{selectedDataset.description || "No description available."}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 pt-2"> {/* Added pt */}
                    <DetailItem label="Tags" value={selectedDataset.tags} />
                    <DetailItem label="Source" value={selectedDataset.source} />
                    <DetailItem label="Location" value={selectedDataset.location} />
                    <div className="flex items-center gap-1.5 text-sm"><span className="font-medium text-foreground/80">Sensitivity:</span> <SensitivityBadge level={selectedDataset.sensitivity} /></div>
                  </div>
                </CardContent>
              </Card>

              <section>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-semibold text-foreground">Tables</h3>
                  <Input
                    type="search"
                    placeholder="Filter tables..."
                    value={tableFilter}
                    onChange={(e) => setTableFilter(e.target.value)}
                    className="max-w-xs bg-background border-input focus:border-primary h-9" // Adjusted height
                  />
                </div>
                {filteredTables.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredTables.map(tbl => (
                      <TableListItem key={tbl.id} table={tbl} onSelect={() => selectTable(tbl.id)} />
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-4">No tables found in this dataset or matching your filter.</p> {/* Added text-center and py */}
                )}
              </section>
            </div>
          )}

          {/* Table Focus View */}
          {selectedDataset && selectedTable && (
            <div className="space-y-6"> {/* Adjusted spacing */}
              <Card className="bg-card shadow-none border-border">
                <CardHeader>
                  <CardTitle className="text-2xl font-bold text-primary">{selectedTable.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-foreground/90">{selectedTable.description || "No description available."}</p>
                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 pt-2"> {/* Added pt */}
                      <DetailItem label="Owner" value={selectedTable.owner} />
                      <DetailItem label="Source" value={selectedTable.source} />
                      <DetailItem label="Location" value={selectedTable.location} />
                      <DetailItem label="Database Name" value={selectedTable.databaseName} />
                      <DetailItem label="Schema Name" value={selectedTable.schemaName} />
                      <DetailItem label="Primary Keys" value={selectedTable.primaryKeys} />
                      <DetailItem label="Foreign Keys" value={selectedTable.foreignKeys} />
                      <DetailItem label="Created Date" value={selectedTable.createdDate} />
                      <DetailItem label="Updated Date" value={selectedTable.updatedDate} />
                      <DetailItem label="Row Count" value={selectedTable.rowCount} />
                      <div className="flex items-center gap-1.5 text-sm"><span className="font-medium text-foreground/80">Sensitivity:</span> <SensitivityBadge level={selectedTable.sensitivity} /></div>
                   </div>
                </CardContent>
              </Card>

              <section>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-semibold text-foreground">Columns</h3>
                   <Input
                    type="search"
                    placeholder="Filter columns..."
                    value={columnFilter}
                    onChange={(e) => setColumnFilter(e.target.value)}
                    className="max-w-xs bg-background border-input focus:border-primary h-9" // Adjusted height
                  />
                </div>
                {filteredColumns.length > 0 ? (
                  <div className="space-y-3">
                    {filteredColumns.map(col => (
                      <ColumnListItem key={col.id} column={col} />
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-4">No columns found in this table or matching your filter.</p> {/* Added text-center and py */}
                )}
              </section>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
