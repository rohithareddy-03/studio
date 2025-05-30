
// src/app/catalog/page.tsx
"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useCatalog } from '@/contexts/CatalogProvider';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Database, Table2, Columns, Loader2, AlertTriangle, ChevronRight, PackageSearch, FileText, Tag, Info, CalendarDays, KeyRound, Rows, MapPin, Search, Pencil, Save, XCircle, Sparkles, BrainCircuit, DatabaseZap } from 'lucide-react';
import { SensitivityBadge } from '@/components/admin/SensitivityBadge';
import { cn } from '@/lib/utils';
import type { EnrichedDataset, EnrichedTable, EnrichedColumn } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';


const DetailItem = ({ icon: Icon, label, value, className }: { icon?: React.ElementType, label: string, value?: string | number | null, className?: string }) => {
  if (!(value || (typeof value === 'number' && value === 0))) {
    return null;
  }
  return (
    <div className={cn("text-sm py-1", className)}>
      <p className="font-semibold text-foreground/70 leading-tight flex items-center gap-1.5">
         {Icon && <Icon size={15} className="text-primary/90 shrink-0" />}
         {label}
      </p>
      <p className="text-foreground/90 break-words leading-snug mt-0.5 ml-1">
        {String(value)}
      </p>
    </div>
  );
};


const DatasetListItem = ({ dataset, onSelect, isSelected }: { dataset: EnrichedDataset, onSelect: () => void, isSelected: boolean }) => (
  <button
    onClick={onSelect}
    className={cn(
      "w-full text-left p-3 rounded-lg hover:bg-primary/10 transition-colors flex items-center justify-between group",
      isSelected ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90" : "bg-card hover:border-primary/20 border border-transparent"
    )}
  >
    <div className="flex items-center gap-3">
      <Database size={20} className={cn(isSelected ? "text-primary-foreground/80" : "text-primary")} />
      <span className={cn("font-semibold", isSelected ? "text-primary-foreground" : "text-foreground")}>{dataset.name}</span>
    </div>
    <ChevronRight size={18} className={cn("text-muted-foreground transition-transform group-hover:translate-x-0.5", isSelected ? "text-primary-foreground/70" : "")} />
  </button>
);

const TableListItem = ({ table, onSelect }: { table: EnrichedTable, onSelect: () => void }) => (
 <Card
    onClick={onSelect}
    className="cursor-pointer hover:shadow-lg hover:border-primary/30 transition-all duration-200 ease-out group bg-card border flex flex-col"
  >
    <CardHeader className="p-4 pb-2">
      <div className="flex items-start justify-between gap-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2 text-primary group-hover:text-primary/90">
          <Table2 size={18} />
          <span className="truncate" title={table.name}>{table.name}</span>
        </CardTitle>
        <SensitivityBadge level={table.sensitivity} />
      </div>
      <CardDescription className="text-xs line-clamp-2 mt-1.5 h-8 text-foreground/70">
        {table.description || "No description available."}
      </CardDescription>
    </CardHeader>
    <CardContent className="p-4 pt-2 text-xs space-y-1.5 text-muted-foreground flex-grow">
        <div className="flex items-center gap-1.5"><Rows size={14} /> Rows: <span className="font-medium text-foreground/80">{table.rowCount ?? 'N/A'}</span></div>
        {table.tags && <div className="flex items-center gap-1.5"><Tag size={14} /> Tags: <span className="font-medium text-foreground/80 truncate" title={table.tags}>{table.tags}</span></div>}
    </CardContent>
  </Card>
);

const SqlEnrichmentModal = ({
  isOpen,
  onClose,
  onSubmit,
  isLoading,
  contextName, // Dataset or Table name
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (sqlQuery: string) => Promise<void>;
  isLoading: boolean;
  contextName: string;
}) => {
  const [sqlQuery, setSqlQuery] = useState('');

  const handleSubmit = async () => {
    if (!sqlQuery.trim()) {
      // Basic validation
      alert('Please enter a SQL query.');
      return;
    }
    await onSubmit(sqlQuery);
    // Optionally clear query or close modal based on onSubmit's success/failure
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <DatabaseZap size={22} /> Enrich Keys via SQL for '{contextName}'
          </DialogTitle>
          <DialogDescription className="text-foreground/80">
            Enter a SQL query (e.g., CREATE TABLE, ALTER TABLE, or a query with JOINs) to help DataSage identify primary and foreign keys. The AI will analyze the query text, not execute it.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Textarea
            placeholder="Enter your SQL query here..."
            value={sqlQuery}
            onChange={(e) => setSqlQuery(e.target.value)}
            rows={10}
            className="bg-background border-input focus:border-primary text-sm"
            disabled={isLoading}
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" onClick={onClose} disabled={isLoading}>Cancel</Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={isLoading || !sqlQuery.trim()} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BrainCircuit size={16} className="mr-2"/>}
            Submit Query for Analysis
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};


export default function CatalogPage() {
  const {
    catalog,
    selectedDataset,
    selectedTable,
    isLoading: isCatalogLoading, // Renamed to avoid conflict
    isEnriching,
    error,
    selectDataset: selectDatasetContext,
    selectTable,
    updateMetadataField,
    enrichDataset,
    enrichTable,
    enrichKeysWithSql,
  } = useCatalog();
  const { toast } = useToast();

  const [datasetFilter, setDatasetFilter] = useState('');
  const [tableFilter, setTableFilter] = useState('');
  const [columnFilter, setColumnFilter] = useState('');

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingFieldKey, setEditingFieldKey] = useState<'description' | 'tags' | null>(null);
  const [currentEditValue, setCurrentEditValue] = useState('');

  const [isSqlModalOpen, setIsSqlModalOpen] = useState(false);
  const [sqlModalContext, setSqlModalContext] = useState<{ type: 'dataset' | 'table'; name: string; datasetName: string; tableName?: string } | null>(null);


  const handleEditClick = (itemId: string, fieldKey: 'description' | 'tags', currentValue: string | null | undefined) => {
    setEditingItemId(itemId);
    setEditingFieldKey(fieldKey);
    setCurrentEditValue(currentValue || '');
  };

  const handleSaveEdit = () => {
    if (editingItemId && editingFieldKey) {
      updateMetadataField(editingItemId, editingFieldKey, currentEditValue);
    }
    setEditingItemId(null);
    setEditingFieldKey(null);
    setCurrentEditValue('');
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
    setEditingFieldKey(null);
    setCurrentEditValue('');
  };
  
  const handleOpenSqlModal = (type: 'dataset' | 'table', name: string, datasetName: string, tableName?: string) => {
    setSqlModalContext({ type, name, datasetName, tableName });
    setIsSqlModalOpen(true);
  };

  const handleSqlSubmit = async (sqlQuery: string) => {
    if (!sqlModalContext) return;
    const { datasetName, tableName } = sqlModalContext;
    const result = await enrichKeysWithSql(sqlQuery, datasetName, tableName);
    if (result.success) {
      toast({
        title: "SQL Key Enrichment Successful",
        description: (
          <div>
            <p>{result.summary}</p>
            { (result.primaryKeysFound && result.primaryKeysFound.length > 0) && <p className="mt-2">Primary Keys: {result.primaryKeysFound.map(k => `${k.tableName}.${k.columnName}`).join(', ')}</p> }
            { (result.foreignKeysFound && result.foreignKeysFound.length > 0) && <p className="mt-1">Foreign Keys: {result.foreignKeysFound.map(k => `${k.tableName}.${k.columnName}`).join(', ')}</p> }
            { (result.warnings && result.warnings.length > 0) && <p className="mt-2 text-orange-500">Warnings: {result.warnings.join('; ')}</p> }
          </div>
        ),
        duration: 10000,
      });
      setIsSqlModalOpen(false);
      setSqlQuery(''); // Clear query from modal state if modal keeps it
    } else {
      toast({
        title: "SQL Key Enrichment Failed",
        description: result.message,
        variant: "destructive",
      });
    }
  };
  const [sqlQuery, setSqlQuery] = useState(''); // Added to satisfy SQL Modal, though modal might have its own state


  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const datasetNameFromQuery = queryParams.get('dataset');
    if (datasetNameFromQuery && catalog?.datasets && !selectedDataset) {
        const dsToSelect = catalog.datasets.find(d => d.name === datasetNameFromQuery);
        if (dsToSelect) {
            selectDatasetContext(dsToSelect.name);
        }
    }
  }, [catalog, selectDatasetContext, selectedDataset]);


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

  useEffect(() => { setTableFilter(''); setEditingItemId(null); }, [selectedDataset]);
  useEffect(() => { setColumnFilter(''); setEditingItemId(null); }, [selectedTable]);

  const clearTableSelection = () => selectTable(null);
  const clearDatasetSelection = () => {
    selectDatasetContext(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('dataset');
    window.history.pushState({}, '', url.toString());
  };

  const renderEditableField = (
    itemId: string,
    fieldKey: 'description' | 'tags',
    currentValue: string | null | undefined,
    label: string,
    isTextarea: boolean = false,
    icon?: React.ElementType
  ) => {
    const isEditing = editingItemId === itemId && editingFieldKey === fieldKey;
    const Icon = icon;

    return (
      <div className="text-sm space-y-1 py-1.5 group">
        <div className="font-semibold text-foreground/70 leading-tight flex items-center gap-1.5">
          {Icon && <Icon size={15} className="text-primary/90 shrink-0" />}
          {label}
          {!isEditing && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 ml-2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
              onClick={() => handleEditClick(itemId, fieldKey, currentValue)}
            >
              <Pencil size={12} />
            </Button>
          )}
        </div>
        {isEditing ? (
          <div className="space-y-2">
            {isTextarea ? (
              <Textarea
                value={currentEditValue}
                onChange={(e) => setCurrentEditValue(e.target.value)}
                rows={3}
                className="text-sm"
              />
            ) : (
              <Input
                value={currentEditValue}
                onChange={(e) => setCurrentEditValue(e.target.value)}
                className="text-sm h-9"
              />
            )}
            <div className="flex gap-2">
              <Button onClick={handleSaveEdit} size="sm" className="bg-green-600 hover:bg-green-700 text-white"><Save size={14} className="mr-1.5" /> Save</Button>
              <Button onClick={handleCancelEdit} variant="outline" size="sm"><XCircle size={14} className="mr-1.5" /> Cancel</Button>
            </div>
          </div>
        ) : (
          <p className={cn("text-foreground/90 break-words leading-snug", Icon ? "ml-0" : "")}>
            {currentValue || <span className="italic text-muted-foreground">Not set</span>}
          </p>
        )}
      </div>
    );
  };


  if (isCatalogLoading && !catalog) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-12rem)]">
        <Loader2 className="h-16 w-16 animate-spin text-primary mb-6" />
        <p className="text-2xl text-muted-foreground font-light">Loading Catalog Universe...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-12rem)] text-destructive p-6 rounded-lg bg-destructive/10 border border-destructive">
        <AlertTriangle size={56} className="mb-5" />
        <p className="text-2xl font-semibold">Error Loading Catalog</p>
        <p className="text-md mt-2">{error}</p>
        <Button onClick={() => window.location.reload()} variant="destructive" className="mt-6">Try Again</Button>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] border border-border bg-background rounded-lg overflow-hidden">
      <aside className="w-1/4 min-w-[280px] max-w-[350px] bg-secondary/50 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-semibold mb-3 text-primary flex items-center gap-2"><Database size={20}/> Datasets</h2>
          <div className="relative">
            <Input
              type="search"
              placeholder="Filter datasets..."
              value={datasetFilter}
              onChange={(e) => setDatasetFilter(e.target.value)}
              className="bg-background border-input focus:border-primary h-9 pl-9"
            />
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        </div>
        <ScrollArea className="flex-1 p-2 space-y-1.5">
          {filteredDatasets.length > 0 ? (
            filteredDatasets.map(ds => (
              <DatasetListItem
                key={ds.id}
                dataset={ds}
                onSelect={() => selectDatasetContext(ds.name)}
                isSelected={selectedDataset?.id === ds.id}
              />
            ))
          ) : (
            <p className="p-4 text-sm text-muted-foreground text-center">No datasets found.</p>
          )}
        </ScrollArea>
      </aside>

      <ScrollArea className="flex-1">
        <main className="flex-1 flex flex-col bg-background p-0">
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
              <div className="flex flex-col items-center justify-center h-[calc(100vh-18rem)] text-muted-foreground p-10">
                <PackageSearch size={64} className="mb-6 opacity-50 stroke-1 text-primary/50" />
                <p className="text-xl font-light">Select a dataset to begin your exploration.</p>
                <p className="text-sm mt-2 text-center max-w-md">Dive into your data universe by choosing a dataset from the panel on the left.</p>
              </div>
            )}

            {selectedDataset && !selectedTable && (
              <div className="space-y-5 animate-fadeIn">
                <Card className="bg-card shadow-sm border">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-xl font-bold text-primary flex items-center gap-2.5">
                        <Database size={24}/>{selectedDataset.name}
                      </CardTitle>
                      <div className="flex gap-2">
                         <Button 
                          onClick={() => enrichDataset(selectedDataset.name)} 
                          variant="outline" 
                          size="sm"
                          disabled={isEnriching}
                          className="text-primary border-primary/50 hover:bg-primary/10 hover:text-primary"
                        >
                          {isEnriching ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Sparkles size={16} className="mr-2"/>}
                          Enrich Details
                        </Button>
                        <Button 
                          onClick={() => handleOpenSqlModal('dataset', selectedDataset.name, selectedDataset.name)} 
                          variant="outline" 
                          size="sm"
                          disabled={isEnriching}
                          className="text-accent border-accent/50 hover:bg-accent/10 hover:text-accent"
                        >
                          {isEnriching ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <DatabaseZap size={16} className="mr-2"/>}
                           Enrich Keys (SQL)
                        </Button>
                      </div>
                    </div>
                     <SensitivityBadge level={selectedDataset.sensitivity} />
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {renderEditableField(selectedDataset.id, 'description', selectedDataset.description, "Description", true, FileText)}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 pt-3 border-t border-border/70 mt-3">
                      {renderEditableField(selectedDataset.id, 'tags', selectedDataset.tags, "Tags", false, Tag)}
                      <DetailItem icon={Info} label="Source" value={selectedDataset.source} />
                      <DetailItem icon={MapPin} label="Location" value={selectedDataset.location} />
                    </div>
                  </CardContent>
                </Card>

                <section>
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-lg font-semibold text-foreground">Tables ({filteredTables.length})</h3>
                    <div className="relative w-full max-w-xs">
                      <Input
                        type="search"
                        placeholder="Filter tables..."
                        value={tableFilter}
                        onChange={(e) => setTableFilter(e.target.value)}
                        className="bg-background border-input focus:border-primary h-9 pl-9"
                      />
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                  {filteredTables.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
                      {filteredTables.map(tbl => (
                        <TableListItem key={tbl.id} table={tbl} onSelect={() => selectTable(tbl.id)} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-6 text-sm">No tables found in this dataset or matching your filter.</p>
                  )}
                </section>
              </div>
            )}

            {selectedDataset && selectedTable && (
              <div className="space-y-5 animate-fadeIn">
                <Card className="bg-card shadow-sm border">
                  <CardHeader className="pb-3">
                     <div className="flex items-center justify-between">
                      <CardTitle className="text-xl font-bold text-primary flex items-center gap-2.5">
                        <Table2 size={24}/>{selectedTable.name}
                      </CardTitle>
                       <div className="flex gap-2">
                          <Button 
                            onClick={() => enrichTable(selectedDataset.name, selectedTable.name)} 
                            variant="outline" 
                            size="sm"
                            disabled={isEnriching}
                            className="text-primary border-primary/50 hover:bg-primary/10 hover:text-primary"
                          >
                            {isEnriching ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Sparkles size={16} className="mr-2"/>}
                            Enrich Details
                          </Button>
                           <Button 
                            onClick={() => handleOpenSqlModal('table', selectedTable.name, selectedDataset.name, selectedTable.name)}
                            variant="outline" 
                            size="sm"
                            disabled={isEnriching}
                            className="text-accent border-accent/50 hover:bg-accent/10 hover:text-accent"
                          >
                            {isEnriching ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <DatabaseZap size={16} className="mr-2"/>}
                             Enrich Keys (SQL)
                          </Button>
                       </div>
                    </div>
                    <SensitivityBadge level={selectedTable.sensitivity} />
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {renderEditableField(selectedTable.id, 'description', selectedTable.description, "Description", true, FileText)}
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1 pt-3.5 border-t border-border/70 mt-3.5">
                        {renderEditableField(selectedTable.id, 'tags', selectedTable.tags, "Tags", false, Tag)}
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
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-lg font-semibold text-foreground">Columns ({filteredColumns.length})</h3>
                     <div className="relative w-full max-w-xs">
                      <Input
                        type="search"
                        placeholder="Filter columns..."
                        value={columnFilter}
                        onChange={(e) => setColumnFilter(e.target.value)}
                        className="bg-background border-input focus:border-primary h-9 pl-9"
                      />
                       <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                  {filteredColumns.length > 0 ? (
                    <div className="space-y-2.5">
                      {filteredColumns.map(col => (
                        <Card key={col.id} className="bg-card border">
                          <CardHeader className="p-3 pb-2">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground/90">
                                <Columns size={16} className="text-primary/90" />
                                {col.name}
                              </CardTitle>
                              <SensitivityBadge level={col.sensitivity} />
                            </div>
                            <CardDescription className="text-xs mt-1 text-foreground/70">
                              Data Type: <span className="font-medium text-foreground/80">{col.dataType || "N/A"}</span>
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="p-3 pt-1 text-xs space-y-1.5 text-muted-foreground">
                             {renderEditableField(col.id, 'description', col.description, "Description", true, FileText)}
                             {renderEditableField(col.id, 'tags', col.tags, "Tags", false, Tag)}
                            {(col.isPrimaryKey || col.isForeignKey) && (
                              <div className="flex gap-2 pt-1">
                                {col.isPrimaryKey && <Badge variant="outline" className="border-accent text-accent text-[0.7rem] px-1.5 py-0.5">Primary Key</Badge>}
                                {col.isForeignKey && <Badge variant="outline" className="border-accent/70 text-accent/70 text-[0.7rem] px-1.5 py-0.5">Foreign Key</Badge>}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-6 text-sm">No columns found in this table or matching your filter.</p>
                  )}
                </section>
              </div>
            )}
          </div>
        </main>
      </ScrollArea>
      {isSqlModalOpen && sqlModalContext && (
        <SqlEnrichmentModal
          isOpen={isSqlModalOpen}
          onClose={() => setIsSqlModalOpen(false)}
          onSubmit={handleSqlSubmit}
          isLoading={isEnriching}
          contextName={sqlModalContext.name}
        />
      )}
    </div>
  );
}
