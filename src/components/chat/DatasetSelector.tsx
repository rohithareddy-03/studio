
// src/components/chat/DatasetSelector.tsx
"use client";

import { useCatalog } from '@/contexts/CatalogProvider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Database, Search, X } from 'lucide-react';
import React, { useState, useEffect, useCallback } from 'react';
// No longer need EnrichedDataset type here for search results

export function DatasetSelector() {
  const { catalog, selectedDataset, selectDataset, isLoading: isCatalogLoading } = useCatalog();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[] | null>(null); // Stores array of dataset names
  const [isSearching, setIsSearching] = useState(false);
  const [displayedDatasets, setDisplayedDatasets] = useState<string[]>([]); // Stores array of dataset names

  const fetchDatasetsByQuery = useCallback(async (query: string) => {
    setIsSearching(true);
    try {
      const response = await fetch(`/api/catalog/search-datasets?query=${encodeURIComponent(query)}`);
      if (!response.ok) {
        throw new Error('Failed to fetch search results');
      }
      const data: { datasetNames: string[] } = await response.json();
      setSearchResults(data.datasetNames);
      setDisplayedDatasets(data.datasetNames);
    } catch (error) {
      console.error("Search error:", error);
      setSearchResults([]);
      setDisplayedDatasets([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Initialize displayed datasets or update when catalog changes and no search is active
  useEffect(() => {
    if (!isCatalogLoading && catalog?.datasets) {
      if (searchResults === null) { // No active search results
        setDisplayedDatasets(catalog.datasets.map(d => d.name));
      } else { // Active search results exist (already strings)
        setDisplayedDatasets(searchResults);
      }
    } else if (isCatalogLoading) {
      setDisplayedDatasets([]);
    }
  }, [catalog, isCatalogLoading, searchResults]);


  const handleSearch = () => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) { // If query is empty after trim, show all datasets from catalog
      setSearchResults(null); // Clear previous search results
      if (catalog?.datasets) {
        setDisplayedDatasets(catalog.datasets.map(d => d.name));
      } else {
        setDisplayedDatasets([]);
      }
      return;
    }
    fetchDatasetsByQuery(trimmedQuery);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(null); // This will trigger useEffect to display all catalog datasets (as names)
  };
  
  const handleDatasetSelection = (value: string) => {
    if (value) {
      selectDataset(value); // selectDataset expects the name string
    } else {
      selectDataset(null);
    }
  };

  if (isCatalogLoading && !catalog?.datasets?.length && !displayedDatasets.length) {
    return (
      <div className="flex items-center space-x-2 py-2 px-1">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Loading datasets...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3 w-full">
      <Label htmlFor="dataset-search-input" className="text-xs font-medium text-muted-foreground px-1">
        Search & Select Dataset Context
      </Label>
      <div className="flex items-center gap-2">
        <div className="relative flex-grow">
            <Input
              id="dataset-search-input"
              type="text"
              placeholder="Search datasets by name, tag, or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 rounded-md bg-background/80 pr-10"
              disabled={isSearching || isCatalogLoading}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSearch();
                }
              }}
            />
            {searchQuery && (
                <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={clearSearch}
                    disabled={isSearching}
                    type="button"
                >
                    <X size={16} />
                </Button>
            )}
        </div>
        <Button onClick={handleSearch} disabled={isSearching || isCatalogLoading} className="h-10 px-4" type="button">
          {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search size={16} />}
          <span className="ml-2 hidden sm:inline">Search</span>
        </Button>
      </div>

      <Select
        value={selectedDataset?.name || ""}
        onValueChange={handleDatasetSelection}
        disabled={isSearching || isCatalogLoading || (!isSearching && displayedDatasets.length === 0 && !catalog?.datasets?.length)}
      >
        <SelectTrigger id="dataset-select" className="w-full h-10 rounded-md bg-background/80 hover:border-primary/50">
          <div className="flex items-center gap-2 truncate">
            <Database size={16} className="text-primary/80 shrink-0" />
            <SelectValue placeholder="Choose a dataset..." />
          </div>
        </SelectTrigger>
        <SelectContent className="bg-popover border-border shadow-xl max-h-60">
          {isSearching && displayedDatasets.length === 0 && searchResults !== null && (
             <div className="p-2 text-sm text-muted-foreground text-center">Searching...</div>
          )}
          {!isSearching && displayedDatasets.length === 0 && (
            <div className="p-2 text-sm text-muted-foreground text-center">
              {searchResults === null && !catalog?.datasets?.length ? 'No datasets available.' : 'No datasets match your search.'}
            </div>
          )}
          {displayedDatasets.map((datasetName) => ( // datasetName is now a string
            <SelectItem key={datasetName} value={datasetName} className="hover:bg-primary/10 focus:bg-primary/10">
              <span className="truncate" title={datasetName}>{datasetName}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

