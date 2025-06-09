
// src/contexts/CatalogProvider.tsx
"use client";

import type { CatalogData, EnrichedDataset, EnrichedTable, ChatMessage as AppChatMessage } from '@/types';
import type { ChatMessageHistory } from '@/ai/flows/chat-integration-with-gemini';
import type { ExtractKeysFromSqlOutput } from '@/ai/flows/extract-keys-from-sql-flow';

import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { useToast } from "@/hooks/use-toast";

interface CatalogContextType {
  catalog: CatalogData | null;
  selectedDataset: EnrichedDataset | null;
  selectedTable: EnrichedTable | null;
  isLoading: boolean; 
  isEnriching: boolean; 
  error: string | null;
  
  // Dataset-specific chat
  chatMessages: AppChatMessage[];
  isChatLoading: boolean;
  sendMessage: (message: string) => Promise<void>;

  // Global catalog chat
  globalChatMessages: AppChatMessage[];
  isGlobalChatLoading: boolean;
  sendGlobalChatMessage: (message: string) => Promise<void>;

  fetchCatalog: () => Promise<void>;
  uploadFile: (file: File) => Promise<void>;
  selectDataset: (datasetName: string | null) => void;
  selectTable: (tableId: string | null) => void;
  updateMetadataField: (itemId: string, fieldKey: 'description' | 'tags', newValue: string) => Promise<void>;
  enrichDataset: (datasetName: string) => Promise<void>;
  enrichTable: (datasetName: string, tableName: string) => Promise<void>;
  enrichKeysWithSql: (sqlQuery: string, datasetName: string, tableName?: string) => Promise<{ success: boolean; message: string; summary?: string; warnings?: string[]; primaryKeysFound?: any[]; foreignKeysFound?: any[] }>;
}

const CatalogContext = createContext<CatalogContextType | undefined>(undefined);

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [selectedDataset, setSelectedDataset] = useState<EnrichedDataset | null>(null);
  const [selectedTable, setSelectedTable] = useState<EnrichedTable | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false); 
  const [error, setError] = useState<string | null>(null);
  
  const [chatMessages, setChatMessages] = useState<AppChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  const [globalChatMessages, setGlobalChatMessages] = useState<AppChatMessage[]>([]);
  const [isGlobalChatLoading, setIsGlobalChatLoading] = useState(false);

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
      // Initialize global chat with a welcome message if catalog is loaded
      if (data && data.datasets.length > 0 && globalChatMessages.length === 0) {
        setGlobalChatMessages([{ id: Date.now().toString() + '-global-welcome', sender: 'ai', content: "Welcome to Global Catalog Chat! How can I help you explore all datasets?", timestamp: new Date() }]);
      } else if ((!data || data.datasets.length === 0) && globalChatMessages.length === 0) {
        setGlobalChatMessages([{ id: Date.now().toString() + '-global-empty', sender: 'ai', content: "The data catalog is currently empty. Please upload data via the Admin page to enable global chat.", timestamp: new Date() }]);
      }

    } catch (err) {
      const newError = err instanceof Error ? err.message : 'An unknown error occurred';
      setError(newError);
      toast({ title: "Error", description: "Failed to fetch catalog data: " + newError, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast, globalChatMessages.length]); // Added globalChatMessages.length dependency

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
      setChatMessages([]); // Clear dataset-specific chat
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
      const data = await response.json();
      setCatalog(data.catalog); 
      setCurrentSelectedDatasetId(null); 
      setCurrentSelectedTableId(null);
      setSelectedDataset(null);
      setSelectedTable(null);
      setChatMessages([]); // Clear dataset chat
      // Reset global chat welcome message based on new catalog state
      if (data.catalog && data.catalog.datasets.length > 0) {
        setGlobalChatMessages([{ id: Date.now().toString() + '-global-welcome-upload', sender: 'ai', content: "Catalog updated. Welcome to Global Catalog Chat! How can I help you explore all datasets?", timestamp: new Date() }]);
      } else {
        setGlobalChatMessages([{ id: Date.now().toString() + '-global-empty-upload', sender: 'ai', content: "Catalog updated, but it's empty. Please upload data via the Admin page to enable global chat.", timestamp: new Date() }]);
      }
      toast({ title: "Success", description: "File uploaded successfully. You can now enrich datasets/tables individually." });
    } catch (err) {
      const newError = err instanceof Error ? err.message : 'An unknown error occurred';
      setError(newError);
      toast({ title: "Upload Error", description: newError, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const enrichDataset = async (datasetName: string) => {
    setIsEnriching(true);
    setError(null);
    try {
      const response = await fetch('/api/catalog/enrich-dataset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasetName }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to enrich dataset ${datasetName}`);
      }
      const data = await response.json();
      setCatalog(data.catalog); 
      toast({ title: "Dataset Enriched", description: data.message });
    } catch (err) {
      const newError = err instanceof Error ? err.message : 'An unknown error occurred';
      setError(newError);
      toast({ title: "Enrichment Error", description: newError, variant: "destructive" });
    } finally {
      setIsEnriching(false);
    }
  };

  const enrichTable = async (datasetName: string, tableName: string) => {
    setIsEnriching(true);
    setError(null);
    try {
      const response = await fetch('/api/catalog/enrich-table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasetName, tableName }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to enrich table ${tableName}`);
      }
      const data = await response.json();
      setCatalog(data.catalog); 
      toast({ title: "Table Enriched", description: data.message });
    } catch (err) {
      const newError = err instanceof Error ? err.message : 'An unknown error occurred';
      setError(newError);
      toast({ title: "Enrichment Error", description: newError, variant: "destructive" });
    } finally {
      setIsEnriching(false);
    }
  };

  const enrichKeysWithSql = async (sqlQuery: string, datasetName: string, tableName?: string) => {
    setIsEnriching(true); 
    setError(null);
    try {
      const response = await fetch('/api/catalog/enrich-keys-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sqlQuery, datasetName, tableName }),
      });
      const data = await response.json(); 
      if (!response.ok) {
        throw new Error(data.error || `Failed to enrich keys for ${tableName || datasetName}`);
      }
      setCatalog(data.catalog); 
      toast({ 
        title: "Keys Enriched via SQL", 
        description: data.summary || data.message,
        duration: 7000,
      });
      return { 
        success: true, 
        message: data.message, 
        summary: data.summary, 
        warnings: data.warnings,
        primaryKeysFound: data.primaryKeysFound,
        foreignKeysFound: data.foreignKeysFound,
      };
    } catch (err) {
      const newError = err instanceof Error ? err.message : 'An unknown error occurred';
      setError(newError);
      toast({ title: "SQL Key Enrichment Error", description: newError, variant: "destructive" });
      return { success: false, message: newError };
    } finally {
      setIsEnriching(false);
    }
  };


  const sendMessage = async (message: string) => {
    if (!selectedDataset) {
      toast({ title: "No Dataset Selected", description: "Please select a dataset before sending a message.", variant: "destructive" });
      return;
    }
    const userMessage: AppChatMessage = { id: Date.now().toString(), sender: 'user', content: message, timestamp: new Date() };
    const historyToPass: ChatMessageHistory[] = chatMessages.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      }));
    setChatMessages(prev => [...prev, userMessage]);
    setIsChatLoading(true);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: message, selectedDatasetName: selectedDataset.name, history: historyToPass }),
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
  
  const sendGlobalChatMessage = async (message: string) => {
    const userMessage: AppChatMessage = { id: Date.now().toString() + '-global', sender: 'user', content: message, timestamp: new Date() };
    const historyToPass: ChatMessageHistory[] = globalChatMessages.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      }));
    setGlobalChatMessages(prev => [...prev, userMessage]);
    setIsGlobalChatLoading(true);
    try {
      const response = await fetch('/api/global-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: message, history: historyToPass }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get response from Global AI Chat');
      }
      const data = await response.json();
      const aiMessage: AppChatMessage = { id: (Date.now() + 1).toString() + '-global-ai', sender: 'ai', content: data.response, timestamp: new Date() };
      setGlobalChatMessages(prev => [...prev, aiMessage]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred with the global chat API.';
      const aiError: AppChatMessage = { id: (Date.now() + 1).toString() + '-global-ai-err', sender: 'ai', content: `Error: ${errorMessage}`, timestamp: new Date() };
      setGlobalChatMessages(prev => [...prev, aiError]);
      toast({ title: "Global Chat Error", description: errorMessage, variant: "destructive" });
    } finally {
      setIsGlobalChatLoading(false);
    }
  };


  const updateMetadataField = async (itemId: string, fieldKey: 'description' | 'tags', newValue: string) => {
    let itemType: 'dataset' | 'table' | 'column' | null = null;
    const parts = itemId.split('/');
    if (parts.length === 1) itemType = 'dataset';
    else if (parts.length === 2) itemType = 'table';
    else if (parts.length === 3) itemType = 'column';

    setCatalog(currentCatalog => {
      if (!currentCatalog) return null;
      const newCatalog = JSON.parse(JSON.stringify(currentCatalog)) as CatalogData; 
      for (const dataset of newCatalog.datasets) {
        if (dataset.id === itemId && itemType === 'dataset') {
          if (fieldKey === 'description') dataset.description = newValue; else if (fieldKey === 'tags') dataset.tags = newValue;
          return newCatalog;
        }
        for (const table of dataset.tables) {
          if (table.id === itemId && itemType === 'table') {
            if (fieldKey === 'description') table.description = newValue; else if (fieldKey === 'tags') table.tags = newValue;
            return newCatalog;
          }
          for (const column of table.columns) {
            if (column.id === itemId && itemType === 'column') {
              if (fieldKey === 'description') column.description = newValue; else if (fieldKey === 'tags') column.tags = newValue;
              return newCatalog;
            }
          }
        }
      }
      return currentCatalog; 
    });
    try {
      const response = await fetch('/api/catalog/update-raw-field', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, fieldKey, newValue }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        fetchCatalog(); 
        toast({ title: "Save Error", description: `Server failed to save: ${errorData.error || 'Unknown server error'}. Client changes reverted.`, variant: "destructive" });
        return; 
      }
      toast({ title: "Metadata Saved", description: `Changes to ${fieldKey} for item ${parts.pop()} saved.`});
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred while saving metadata.';
      fetchCatalog(); 
      toast({ title: "Save Error", description: `${errorMessage}. Client changes reverted.`, variant: "destructive" });
    }
  };


  return (
    <CatalogContext.Provider value={{
      catalog, selectedDataset, selectedTable, isLoading, isEnriching, error,
      chatMessages, isChatLoading, sendMessage,
      globalChatMessages, isGlobalChatLoading, sendGlobalChatMessage,
      fetchCatalog, uploadFile, selectDataset,
      selectTable, updateMetadataField, enrichDataset, enrichTable,
      enrichKeysWithSql
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
