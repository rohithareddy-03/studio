
// src/app/page.tsx
"use client";

import { DatasetSelector } from '@/components/chat/DatasetSelector';
import { ChatMessage } from '@/components/chat/ChatMessage';
import { ChatInput } from '@/components/chat/ChatInput';
import { useCatalog } from '@/contexts/CatalogProvider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertCircle, MessageSquareDashed } from 'lucide-react'; // Added MessageSquareDashed
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
    <div className="flex flex-col md:flex-row h-[calc(100vh-10rem)] md:h-[calc(100vh-8rem)] bg-transparent rounded-lg border border-border overflow-hidden"> {/* Adjusted height */}
      <aside className="w-full md:w-1/4 lg:w-1/5 bg-background md:border-r border-border md:h-full overflow-y-auto"> 
        <DatasetSelector />
      </aside>
      <section className="flex flex-col flex-grow h-full">
        <ScrollArea className="flex-grow p-4 sm:p-6" ref={scrollAreaRef}> 
          {chatMessages.length === 0 && !isCatalogLoading && (
             <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                {selectedDataset 
                    ? <>
                        <MessageSquareDashed size={48} className="mb-4 opacity-70" />
                        <p className="text-lg">No messages yet.</p>
                        <p className="text-sm mt-1">Start the conversation about the '{selectedDataset.name}' dataset!</p>
                      </>
                    : <>
                        <AlertCircle size={48} className="mb-4 opacity-70" />
                        <p className="text-lg">Please select a dataset.</p>
                        <p className="text-sm mt-1">Choose a dataset from the panel to begin chatting.</p>
                      </>
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
