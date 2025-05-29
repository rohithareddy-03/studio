// src/app/page.tsx
"use client";

import { DatasetSelector } from '@/components/chat/DatasetSelector';
import { ChatMessage } from '@/components/chat/ChatMessage';
import { ChatInput } from '@/components/chat/ChatInput';
import { useCatalog } from '@/contexts/CatalogProvider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';
import { useEffect, useRef } from 'react';

export default function ChatPage() {
  const { chatMessages, selectedDataset, isLoading: isCatalogLoading } = useCatalog();
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [chatMessages]);

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-10rem)]  bg-card rounded-lg shadow-xl border overflow-hidden">
      <aside className="w-full md:w-1/4 lg:w-1/5 bg-background/50 md:h-full overflow-y-auto">
        <DatasetSelector />
      </aside>
      <section className="flex flex-col flex-grow h-full">
        <ScrollArea className="flex-grow p-4" ref={scrollAreaRef}>
          {chatMessages.length === 0 && !isCatalogLoading && (
             <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <AlertCircle size={48} className="mb-4" />
                {selectedDataset 
                    ? <p>No messages yet. Start the conversation!</p> 
                    : <p>Please select a dataset to begin chatting.</p>
                }
            </div>
          )}
          {chatMessages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
        </ScrollArea>
        <ChatInput />
      </section>
    </div>
  );
}
