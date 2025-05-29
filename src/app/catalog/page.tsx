// src/app/catalog/page.tsx
"use client";

import { useCatalog } from '@/contexts/CatalogProvider';
import { DatasetListPanel } from '@/components/catalog/DatasetListPanel';
import { DatasetDetailPanel } from '@/components/catalog/DatasetDetailPanel';
import { ColumnDetailPanel } from '@/components/catalog/ColumnDetailPanel';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, AlertTriangle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils'; 

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
  
  // For responsive behavior: current view state on smaller screens
  const [mobileView, setMobileView] = useState<'datasets' | 'tables' | 'columns'>('datasets');

  useEffect(() => {
    if (selectedDataset && !selectedTable) {
      setMobileView('tables');
    } else if (selectedDataset && selectedTable) {
      setMobileView('columns');
    } else {
      setMobileView('datasets');
    }
  }, [selectedDataset, selectedTable]);

  const handleBack = () => {
    if (mobileView === 'columns') {
      selectTable(null); 
    } else if (mobileView === 'tables') {
      selectDataset(null); 
    }
  };
  
  if (isLoading && !catalog) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-12rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-xl text-muted-foreground">Loading Catalog...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-12rem)] text-destructive">
        <AlertTriangle size={48} className="mb-4" />
        <p className="text-xl">Error loading catalog</p>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (!catalog || catalog.datasets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-12rem)]">
        <AlertTriangle size={48} className="mb-4 text-muted-foreground" />
        <p className="text-xl text-muted-foreground">No datasets available.</p>
        <p className="text-sm text-muted-foreground">Please upload a catalog file in the Admin section.</p>
      </div>
    );
  }

  const commonPanelClasses = "bg-card border border-border rounded-lg shadow-sm overflow-y-auto p-1";
  const commonHeaderClasses = "p-4 border-b border-border sticky top-0 bg-card z-10";

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] md:h-[calc(100vh-8rem)] space-y-4 py-2">
      {/* Header for mobile back button and global actions */}
      <div className="md:hidden flex items-center justify-between px-1 mb-0">
        {mobileView !== 'datasets' && (
          <Button variant="ghost" size="icon" onClick={handleBack} className="text-primary">
            <ArrowLeft size={20} />
          </Button>
        )}
        <span className="font-semibold text-lg">
          {mobileView === 'datasets' && 'Datasets'}
          {mobileView === 'tables' && selectedDataset?.name}
          {mobileView === 'columns' && selectedTable?.name}
        </span>
        <div className="space-x-2">
           {/* Actions could be here or in a dropdown for mobile */}
        </div>
      </div>

      {/* Main multi-panel layout */}
      <div className="flex flex-1 space-x-0 md:space-x-4 overflow-hidden">
        {/* Dataset List Panel (Left) */}
        <div className={cn(
          "w-full md:w-1/4 flex-col",
          mobileView === 'datasets' ? 'flex' : 'hidden md:flex',
          commonPanelClasses
        )}>
          <div className={commonHeaderClasses}>
            <h2 className="text-xl font-semibold">Datasets</h2>
             <Input type="search" placeholder="Filter datasets..." className="mt-2 w-full" />
          </div>
          <div className="p-4 space-y-3 flex-1 overflow-y-auto">
            <DatasetListPanel />
          </div>
        </div>

        {/* Separator for desktop */}
        <Separator orientation="vertical" className="hidden md:block h-full" />

        {/* Dataset Detail / Table List Panel (Middle) */}
        <div className={cn(
          "w-full md:w-1/2 flex-col",
          mobileView === 'tables' ? 'flex' : 'hidden md:flex',
          commonPanelClasses
        )}>
           <div className={commonHeaderClasses}>
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">{selectedDataset ? selectedDataset.name : 'Select a Dataset'}</h2>
                {selectedDataset && (
                   <div className="space-x-2">
                     {/* Removed Download and Re-Enrich buttons */}
                     <Button variant="outline" size="sm" disabled>Edit</Button> {/* Placeholder */}
                   </div>
                )}
              </div>
             <Input type="search" placeholder="Filter tables..." className="mt-2 w-full" disabled={!selectedDataset} />
          </div>
          <div className="p-4 space-y-3 flex-1 overflow-y-auto">
             <DatasetDetailPanel />
          </div>
        </div>
        
        {/* Separator for desktop */}
        <Separator orientation="vertical" className="hidden md:block h-full" />

        {/* Column Detail Panel (Right) */}
        <div className={cn(
          "w-full md:w-1/4 flex-col",
          mobileView === 'columns' ? 'flex' : 'hidden md:flex',
          commonPanelClasses
        )}>
          <div className={commonHeaderClasses}>
            <h2 className="text-xl font-semibold">{selectedTable ? selectedTable.name : 'Select a Table'}</h2>
             <Input type="search" placeholder="Filter columns..." className="mt-2 w-full" disabled={!selectedTable} />
          </div>
          <div className="p-4 space-y-3 flex-1 overflow-y-auto">
            <ColumnDetailPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
