// src/contexts/CatalogProvider.tsx
"use client";

import type { CatalogData, EnrichedDataset, ChatMessage } from '@/types';
import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { useToast } from "@/hooks/use-toast";

interface CatalogContextType {
  catalog: CatalogData | null;
  selectedDataset: EnrichedDataset | null;
  isLoading: boolean;
  error: string | null;
  chatMessages: ChatMessage[];
  isChatLoading: boolean;
  fetchCatalog: () => Promise<void>;
  uploadFile: (file: File) => Promise<void>;
  selectDataset: (datasetName: string | null) => void;
  sendMessage: (message: string) => Promise<void>;
  reEnrich: () => Promise<void>;
}

const CatalogContext = createContext<CatalogContextType | undefined>(undefined);

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [selectedDataset, setSelectedDataset] = useState<EnrichedDataset | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const { toast } = useToast();

  const fetchCatalog = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/catalog');
      if (!response.ok) throw new Error('Failed to fetch catalog');
      const data: CatalogData = await response.json();
      setCatalog(data);
      // If a dataset was previously selected, try to re-select it from the new catalog
      if (selectedDataset && data.datasets) {
        const refreshedSelectedDataset = data.datasets.find(d => d.name === selectedDataset.name);
        setSelectedDataset(refreshedSelectedDataset || null);
      } else {
        setSelectedDataset(null); // Clear selection if catalog is empty or previous selection not found
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      toast({ title: "Error", description: "Failed to fetch catalog data.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast, selectedDataset]);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

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
      await fetchCatalog(); // Refresh catalog after upload
      toast({ title: "Success", description: "File uploaded and metadata enriched." });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      toast({ title: "Error", description: err instanceof Error ? err.message : "File upload failed.", variant: "destructive" });
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
      await fetchCatalog(); // Refresh catalog after re-enrichment
      toast({ title: "Success", description: "Metadata re-enriched successfully." });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      toast({ title: "Error", description: err instanceof Error ? err.message : "Metadata re-enrichment failed.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const selectDataset = (datasetName: string | null) => {
    if (!datasetName) {
      setSelectedDataset(null);
      setChatMessages([]); // Clear chat when dataset is deselected
      return;
    }
    const ds = catalog?.datasets.find(d => d.name === datasetName) || null;
    setSelectedDataset(ds);
    setChatMessages([]); // Clear chat when dataset changes
    if (ds) {
      // Add an initial AI message if a dataset is selected
       setChatMessages([{ id: Date.now().toString(), sender: 'ai', content: `Selected dataset: ${ds.name}. How can I help you?`, timestamp: new Date() }]);
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
      isLoading,
      error,
      chatMessages,
      isChatLoading,
      fetchCatalog,
      uploadFile,
      selectDataset,
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
