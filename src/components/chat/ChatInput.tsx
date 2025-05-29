// src/components/chat/ChatInput.tsx
"use client";

import { useState, FormEvent } from 'react';
import { useCatalog } from '@/contexts/CatalogProvider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, Loader2 } from 'lucide-react';

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
    <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t p-4 bg-background">
      <Input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={selectedDataset ? "Ask about the selected dataset..." : "Please select a dataset first."}
        className="flex-grow"
        disabled={!selectedDataset || isChatLoading}
        aria-label="Chat message input"
      />
      <Button type="submit" disabled={!selectedDataset || isChatLoading || !message.trim()} size="icon" aria-label="Send message">
        {isChatLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send size={20} />}
      </Button>
    </form>
  );
}
