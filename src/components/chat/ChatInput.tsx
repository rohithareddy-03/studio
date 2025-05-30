
// src/components/chat/ChatInput.tsx
"use client";

import { useState, FormEvent } from 'react';
import { useCatalog } from '@/contexts/CatalogProvider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SendHorizonal, Loader2, CornerDownLeft } from 'lucide-react'; // Changed Send to SendHorizonal

export function ChatInput() {
  const [message, setMessage] = useState('');
  const { sendMessage, selectedDataset, isChatLoading } = useCatalog();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !selectedDataset) return;
    await sendMessage(message.trim());
    setMessage('');
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-3 border-t border-border/50 p-3 bg-background/80">
      <Input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={selectedDataset ? `Ask about ${selectedDataset.name}...` : "Select a dataset to chat."}
        className="flex-grow h-10 rounded-full bg-background focus:border-primary/70 pl-4 pr-12 text-sm" // Added rounded-full
        disabled={!selectedDataset || isChatLoading}
        aria-label="Chat message input"
      />
      <Button type="submit" disabled={!selectedDataset || isChatLoading || !message.trim()} size="icon" className="rounded-full w-10 h-10 bg-primary hover:bg-primary/90">
        {isChatLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <SendHorizonal size={20} />}
      </Button>
    </form>
  );
}
