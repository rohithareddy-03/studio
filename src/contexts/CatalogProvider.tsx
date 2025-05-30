
// src/contexts/CatalogProvider.tsx
"use client";

import type { CatalogData, EnrichedDataset, EnrichedTable, ChatMessage } from '@/types';
import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { useToast } from "@/hooks/use-toast";

interface CatalogContextType {
  catalog: CatalogData | null;
  selectedDataset: EnrichedDataset | null;
  selectedTable: EnrichedTable | null;
  isLoading: boolean;
  error: string | null;
  chatMessages: ChatMessage[];
  isChatLoading: boolean;
  fetchCatalog: () => Promise<void>;
  uploadFile: (file: File) => Promise<void>;
  selectDataset: (datasetName: string | null) => void;
  selectTable: (tableId: string | null) => void;
  sendMessage: (message: string) => Promise<void>;
  reEnrich: () => Promise<void>;
}

const CatalogContext = createContext<CatalogContextType | undefined>(undefined);

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [selectedDataset, setSelectedDataset] = useState<EnrichedDataset | null>(null);
  const [selectedTable, setSelectedTable] = useState<EnrichedTable | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const { toast } = useToast();

  const [currentSelectedDatasetId, setCurrentSelectedDatasetId] = useState<string | null>(null);
  const [currentSelectedTableId, setCurrentSelectedTableId] = useState<string | null>(null);

  const fetchCatalog = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/catalog');
      if (!response.ok) throw new Error('Failed to fetch catalog');
      const data: CatalogData = await response.json();
      setCatalog(data);
      // selectedDataset and selectedTable will be updated by the useEffects below
    } catch (err) {
      const newError = err instanceof Error ? err.message : 'An unknown error occurred';
      setError(newError);
      toast({ title: "Error", description: "Failed to fetch catalog data: " + newError, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]); // fetchCatalog callback dependency is now stable

  useEffect(() => { // Initial fetch
    fetchCatalog();
  }, [fetchCatalog]);

  // Effect to update selectedDataset object when ID or catalog changes
  useEffect(() => {
    if (catalog && currentSelectedDatasetId) {
      const ds = catalog.datasets.find(d => d.id === currentSelectedDatasetId);
      setSelectedDataset(ds || null);
      if (!ds) { // If dataset is no longer found (e.g., after a catalog refresh where it's deleted)
        setCurrentSelectedTableId(null); // Also clear selected table ID
        setSelectedTable(null);
      }
    } else {
      setSelectedDataset(null);
      // If no dataset is selected (or catalog is null), ensure selected table is also null
      if (!currentSelectedDatasetId) {
        setCurrentSelectedTableId(null);
        setSelectedTable(null);
      }
    }
  }, [catalog, currentSelectedDatasetId]);

  // Effect to update selectedTable object when its ID or the parent selectedDataset changes
  useEffect(() => {
    if (selectedDataset && currentSelectedTableId) {
      const table = selectedDataset.tables.find(t => t.id === currentSelectedTableId);
      setSelectedTable(table || null);
    } else {
      setSelectedTable(null); // Clear table if no parent dataset or no table ID
    }
  }, [selectedDataset, currentSelectedTableId]);


  const selectDataset = useCallback((datasetName: string | null) => {
    if (!datasetName) {
      setCurrentSelectedDatasetId(null);
      setCurrentSelectedTableId(null);
      setChatMessages([]);
      return;
    }
    // Find by name to get ID, as name is what's usually passed from UI elements
    const ds = catalog?.datasets.find(d => d.name === datasetName);
    if (ds) {
      setCurrentSelectedDatasetId(ds.id);
      setCurrentSelectedTableId(null); // Clear selected table when dataset changes
      setChatMessages([{ id: Date.now().toString(), sender: 'ai', content: `Selected dataset: ${ds.name}. How can I help you?`, timestamp: new Date() }]);
    } else {
      // Dataset name not found in current catalog
      setCurrentSelectedDatasetId(null);
      setCurrentSelectedTableId(null);
      setChatMessages([]);
    }
  }, [catalog]); // Depends on catalog to find dataset by name

  const selectTable = useCallback((tableId: string | null) => {
    setCurrentSelectedTableId(tableId);
  }, []);


  const uploadFile = async (file: File) => {
    setIsLoading(true);
    setError(null);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'File upload failed');
      }
      await fetchCatalog();
      toast({ title: "Success", description: "File uploaded and metadata enriched." });
    } catch (err) {
      const newError = err instanceof Error ? err.message : 'An unknown error occurred';
      setError(newError);
      toast({ title: "Error", description: newError, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const reEnrich = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/catalog/enrich', { method: 'POST' });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Metadata re-enrichment failed');
      }
      await fetchCatalog();
      toast({ title: "Success", description: "Metadata re-enriched successfully." });
    } catch (err) {
      const newError = err instanceof Error ? err.message : 'An unknown error occurred';
      setError(newError);
      toast({ title: "Error", description: newError, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async (message: string) => {
    if (!selectedDataset) {
      toast({ title: "No Dataset Selected", description: "Please select a dataset before sending a message.", variant: "destructive" });
      return;
    }

    const userMessage: ChatMessage = { id: Date.now().toString(), sender: 'user', content: message, timestamp: new Date() };
    setChatMessages(prev => [...prev, userMessage]);
    setIsChatLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: message, selectedDatasetName: selectedDataset.name }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get response from AI');
      }
      const data = await response.json();
      const aiMessage: ChatMessage = { id: (Date.now() + 1).toString(), sender: 'ai', content: data.response, timestamp: new Date() };
      setChatMessages(prev => [...prev, aiMessage]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred with the chat API.';
      const aiError: ChatMessage = { id: (Date.now() + 1).toString(), sender: 'ai', content: `Error: ${errorMessage}`, timestamp: new Date() };
      setChatMessages(prev => [...prev, aiError]);
      toast({ title: "Chat Error", description: errorMessage, variant: "destructive" });
    } finally {
      setIsChatLoading(false);
    }
  };


  return (
    <CatalogContext.Provider value={{
      catalog,
      selectedDataset,
      selectedTable,
      isLoading,
      error,
      chatMessages,
      isChatLoading,
      fetchCatalog,
      uploadFile,
      selectDataset,
      selectTable,
      sendMessage,
      reEnrich
    }}>
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog() {
  const context = useContext(CatalogContext);
  if (context === undefined) {
    throw new Error('useCatalog must be used within a CatalogProvider');
  }
  return context;
}
