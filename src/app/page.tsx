
// src/app/page.tsx - Dashboard / Chat
"use client";

import { DatasetSelector } from '@/components/chat/DatasetSelector';
import { ChatMessage } from '@/components/chat/ChatMessage';
import { ChatInput } from '@/components/chat/ChatInput';
import { useCatalog } from '@/contexts/CatalogProvider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, MessageSquareDashed, Zap, Star, BarChartBig, Globe, Columns } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { EnrichedDataset } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

const FeaturedDatasetCard = ({ dataset }: { dataset: EnrichedDataset }) => {
  const tableCount = dataset.tables.length;
  const columnCount = dataset.tables.reduce((acc, table) => acc + table.columns.length, 0);

  return (
    <Card className="bg-card/80 backdrop-blur-sm border-border/60 hover:shadow-primary/10 hover:border-primary/30 transition-all duration-300 ease-out group">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between mb-2">
          <CardTitle className="text-lg font-semibold text-primary group-hover:text-primary/90">
            {dataset.name}
          </CardTitle>
          <Star size={18} className="text-accent/70 group-hover:text-accent group-hover:scale-110 transition-all" />
        </div>
        <CardDescription className="text-xs line-clamp-2 h-8">
          {dataset.description || "No description available."}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-xs space-y-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <BarChartBig size={14} />
          <span>{tableCount} Tables, {columnCount} Columns</span>
        </div>
        {dataset.tags && (
          <p className="text-muted-foreground line-clamp-1">
            Tags: <span className="font-medium text-foreground/80">{dataset.tags}</span>
          </p>
        )}
        <Button variant="ghost" size="sm" className="w-full mt-2 text-primary group-hover:bg-primary/10" asChild>
          <Link href={`/catalog?dataset=${encodeURIComponent(dataset.name)}`}>Explore Dataset</Link>
        </Button>
      </CardContent>
    </Card>
  );
};


export default function DashboardPage() {
  const { 
    chatMessages, 
    selectedDataset, 
    isCatalogLoading, 
    catalog, 
    selectDataset, 
    sendMessage, 
    isChatLoading,
    globalChatMessages,
    isGlobalChatLoading,
    sendGlobalChatMessage
  } = useCatalog();
  
  const datasetChatScrollAreaRef = useRef<HTMLDivElement>(null);
  const globalChatScrollAreaRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState("global-chat"); // Default to global-chat

  useEffect(() => {
    if (activeTab === "dataset-chat" && datasetChatScrollAreaRef.current) {
      datasetChatScrollAreaRef.current.scrollTop = datasetChatScrollAreaRef.current.scrollHeight;
    } else if (activeTab === "global-chat" && globalChatScrollAreaRef.current) {
      globalChatScrollAreaRef.current.scrollTop = globalChatScrollAreaRef.current.scrollHeight;
    }
  }, [chatMessages, globalChatMessages, activeTab]);

  const featuredDatasets = useMemo(() => {
    if (!catalog?.datasets) return [];
    return catalog.datasets.slice(0, 3);
  }, [catalog]);

  const handleDatasetSelectForChat = (datasetName: string) => {
    selectDataset(datasetName);
    setActiveTab("dataset-chat"); // Switch to dataset chat tab when a dataset is selected
  };

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-10rem)] gap-6">
      {/* Left Panel: Featured Datasets / Catalog Highlights */}
      <section className="w-full lg:w-1/3 xl:w-1/4 flex flex-col space-y-4">
        <div className="p-4 rounded-lg bg-card/70 backdrop-blur-sm border border-border/50">
          <h2 className="text-xl font-semibold text-foreground mb-3 flex items-center gap-2">
            <Zap size={22} className="text-accent" /> Quick Access
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Jump directly into your most relevant datasets. Click to select for contextual chat.
          </p>
        </div>
        <ScrollArea className="flex-1 pr-2">
          {isCatalogLoading && !catalog && <p className="text-muted-foreground p-4">Loading datasets...</p>}
          {!isCatalogLoading && featuredDatasets.length === 0 && (
            <p className="text-muted-foreground p-4 text-center">No datasets available yet. Visit Admin to upload.</p>
          )}
          <div className="space-y-3">
            {featuredDatasets.map(ds => (
              <div key={ds.id} onClick={() => handleDatasetSelectForChat(ds.name)} className="cursor-pointer">
                <FeaturedDatasetCard dataset={ds} />
              </div>
            ))}
          </div>
        </ScrollArea>
      </section>

      {/* Right Panel: Chat Interface with Tabs */}
      <section className="flex flex-col flex-grow h-full bg-card/70 backdrop-blur-sm rounded-lg border border-border/50 overflow-hidden shadow-lg">
        <Tabs defaultValue="global-chat" className="flex flex-col h-full" onValueChange={setActiveTab} value={activeTab}>
          <TabsList className="grid w-full grid-cols-2 rounded-none rounded-t-lg border-b border-border/50 bg-card/80">
            <TabsTrigger value="global-chat" className="py-2.5 text-sm data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:font-semibold rounded-none">
              <Globe size={16} className="mr-2" /> Global Catalog Chat
            </TabsTrigger>
            <TabsTrigger value="dataset-chat" className="py-2.5 text-sm data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:font-semibold rounded-none">
              <Columns size={16} className="mr-2" /> Dataset Context Chat
            </TabsTrigger>
          </TabsList>

          <TabsContent value="global-chat" className="flex flex-col flex-grow m-0 overflow-hidden">
            <div className="p-4 border-b border-border/50 h-24 flex items-center">
               <p className="text-sm text-muted-foreground px-1">Ask questions about any dataset or table in the entire catalog.</p>
            </div>
            <ScrollArea className="flex-grow p-4 sm:p-6" ref={globalChatScrollAreaRef}>
              <div className="flex flex-col justify-end min-h-full">
                {globalChatMessages.length === 0 && !isCatalogLoading && (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-center px-4">
                      <Globe size={52} className="mb-4 opacity-60 stroke-1" />
                      <p className="text-xl font-medium">Global Catalog Chat</p>
                      <p className="text-sm mt-1">Ask questions about any dataset, compare datasets, or find specific tables across the catalog.</p>
                  </div>
                )}
                {globalChatMessages.map((msg) => (
                  <ChatMessage key={msg.id} message={msg} />
                ))}
              </div>
            </ScrollArea>
            <ChatInput
              onSubmitQuery={sendGlobalChatMessage}
              isLoading={isGlobalChatLoading}
              placeholderText="Ask about the entire data catalog..."
            />
          </TabsContent>

          <TabsContent value="dataset-chat" className="flex flex-col flex-grow m-0 overflow-hidden">
            <div className="p-4 border-b border-border/50 h-24 flex flex-col justify-center">
              <DatasetSelector />
            </div>
            <ScrollArea className="flex-grow p-4 sm:p-6" ref={datasetChatScrollAreaRef}>
              <div className="flex flex-col justify-end min-h-full">
                {chatMessages.length === 0 && !isCatalogLoading && (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-center px-4">
                    {selectedDataset
                        ? <>
                            <MessageSquareDashed size={52} className="mb-4 opacity-60 stroke-1" />
                            <p className="text-xl font-medium">Chat with '{selectedDataset.name}'</p>
                            <p className="text-sm mt-1">Ask questions, generate SQL, or get summaries about this dataset.</p>
                          </>
                        : <>
                            <AlertCircle size={52} className="mb-4 opacity-60 stroke-1" />
                            <p className="text-xl font-medium">Dataset Chat</p>
                            <p className="text-sm mt-1">Select a dataset from 'Quick Access' or the dropdown above to begin contextual chat.</p>
                          </>
                    }
                </div>
                )}
                {chatMessages.map((msg) => (
                  <ChatMessage key={msg.id} message={msg} />
                ))}
              </div>
            </ScrollArea>
            <ChatInput
              onSubmitQuery={sendMessage}
              isLoading={isChatLoading}
              placeholderText={selectedDataset ? `Ask about ${selectedDataset.name}...` : "Select a dataset to chat."}
              disabled={!selectedDataset}
            />
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}
