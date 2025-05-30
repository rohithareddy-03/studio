
// src/contexts/CatalogProvider.tsx
"use client";

import type { CatalogData, EnrichedDataset, EnrichedTable, ChatMessage as AppChatMessage } from '@/types';
import type { ChatMessageHistory } from '@/ai/flows/chat-integration-with-gemini'; // Import AI flow's history type
import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { useToast } from "@/hooks/use-toast";

interface CatalogContextType {
  catalog: CatalogData | null;
  selectedDataset: EnrichedDataset | null;
  selectedTable: EnrichedTable | null;
  isLoading: boolean;
  error: string | null;
  chatMessages: AppChatMessage[];
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
  const [chatMessages, setChatMessages] = useState<AppChatMessage[]>([]);
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
    } catch (err) {
      const newError = err instanceof Error ? err.message : 'An unknown error occurred';
      setError(newError);
      toast({ title: "Error", description: "Failed to fetch catalog data: " + newError, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]); 

  useEffect(() => { 
    fetchCatalog();
  }, [fetchCatalog]);

  useEffect(() => {
    if (catalog && currentSelectedDatasetId) {
      const ds = catalog.datasets.find(d => d.id === currentSelectedDatasetId);
      setSelectedDataset(ds || null);
      if (!ds) { 
        setCurrentSelectedTableId(null);
        setSelectedTable(null);
      }
    } else {
      setSelectedDataset(null);
      if (!currentSelectedDatasetId) {
        setCurrentSelectedTableId(null);
        setSelectedTable(null);
      }
    }
  }, [catalog, currentSelectedDatasetId]);

  useEffect(() => {
    if (selectedDataset && currentSelectedTableId) {
      const table = selectedDataset.tables.find(t => t.id === currentSelectedTableId);
      setSelectedTable(table || null);
    } else {
      setSelectedTable(null); 
    }
  }, [selectedDataset, currentSelectedTableId]);


  const selectDataset = useCallback((datasetName: string | null) => {
    if (!datasetName) {
      setCurrentSelectedDatasetId(null);
      setCurrentSelectedTableId(null);
      setChatMessages([]);
      return;
    }
    const ds = catalog?.datasets.find(d => d.name === datasetName);
    if (ds) {
      setCurrentSelectedDatasetId(ds.id);
      setCurrentSelectedTableId(null); 
      setChatMessages([{ id: Date.now().toString(), sender: 'ai', content: `Selected dataset: **${ds.name}**. I am DataSage, your specialized AI assistant for this data catalog. How can I help you explore this dataset?`, timestamp: new Date() }]);
    } else {
      setCurrentSelectedDatasetId(null);
      setCurrentSelectedTableId(null);
      setChatMessages([]);
    }
  }, [catalog]); 

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
        throw new Error(errorData.error || 'Metadata re-enrichment failed. This could be due to an AI processing error or no initial data being available for enrichment.');
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

    const userMessage: AppChatMessage = { id: Date.now().toString(), sender: 'user', content: message, timestamp: new Date() };
    
    // Prepare history for AI
    // The AI expects the most recent message (the user's current query) to be part of the main 'query' input, not in the history.
    // So, we take all messages *except* the latest one if it's the user's first message in this interaction,
    // or all previous messages for subsequent turns.
    const historyToPass: ChatMessageHistory[] = chatMessages
      .map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      }));

    setChatMessages(prev => [...prev, userMessage]);
    setIsChatLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: message, 
          selectedDatasetName: selectedDataset.name,
          history: historyToPass 
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get response from AI');
      }
      const data = await response.json();
      const aiMessage: AppChatMessage = { id: (Date.now() + 1).toString(), sender: 'ai', content: data.response, timestamp: new Date() };
      setChatMessages(prev => [...prev, aiMessage]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred with the chat API.';
      const aiError: AppChatMessage = { id: (Date.now() + 1).toString(), sender: 'ai', content: `Error: ${errorMessage}`, timestamp: new Date() };
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
