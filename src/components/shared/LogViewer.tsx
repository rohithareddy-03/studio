// src/components/shared/LogViewer.tsx
"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RefreshCw, Trash2, ListChecks, Loader2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface LogEntry {
  timestamp: string; // ISO string
  message: string;
}

interface LogViewerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LogViewer({ isOpen, onOpenChange }: LogViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/logs');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch logs, server returned non-JSON response' }));
        throw new Error(errorData.error || `Failed to fetch logs: ${response.statusText}`);
      }
      const data: { logs: LogEntry[] } = await response.json();
      setLogs(data.logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())); // Show newest first
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred while fetching logs.';
      setError(errorMessage);
      toast({
        title: 'Error Fetching Logs',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const clearServerLogs = async () => {
    if (!confirm("Are you sure you want to clear all server-side in-memory logs? This cannot be undone.")) {
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch('/api/logs', { method: 'DELETE' });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to clear logs, server returned non-JSON response' }));
        throw new Error(errorData.error || `Failed to clear server logs: ${response.statusText}`);
      }
      await response.json();
      toast({
        title: 'Server Logs Cleared',
        description: 'In-memory server logs have been cleared.',
      });
      fetchLogs(); // Refresh logs after clearing
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred while clearing server logs.';
        toast({
            title: 'Error Clearing Server Logs',
            description: errorMessage,
            variant: 'destructive',
        });
    } finally {
        setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
    }
  }, [isOpen, fetchLogs]);

  useEffect(() => {
    // Scroll to bottom when logs change
    if (scrollAreaRef.current) {
      // If showing newest first, scroll to top. If oldest first, scroll to bottom.
      // Assuming logs are sorted newest first for display
      scrollAreaRef.current.scrollTop = 0;
    }
  }, [logs]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[80vw] md:max-w-[70vw] lg:max-w-[60vw] h-[80vh] flex flex-col bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <ListChecks size={22} /> Server Log Viewer (Recent)
          </DialogTitle>
          <DialogDescription className="text-foreground/80">
            Showing the last {logs.length} captured server log messages (newest first). This is an in-memory store and resets on server restart.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-grow overflow-hidden relative">
          <ScrollArea className="h-full w-full p-1 rounded-md border border-input bg-background/50" ref={scrollAreaRef}>
            {isLoading && logs.length === 0 && (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading logs...
              </div>
            )}
            {error && (
              <div className="flex flex-col items-center justify-center h-full text-destructive p-4">
                <AlertTriangle className="h-8 w-8 mb-2" />
                <p className="font-semibold">Error loading logs:</p>
                <p className="text-sm text-center">{error}</p>
              </div>
            )}
            {!isLoading && !error && logs.length === 0 && (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No logs captured or logs have been cleared.
              </div>
            )}
            {!error && logs.length > 0 && (
              <pre className="text-xs p-2 whitespace-pre-wrap break-all">
                {logs.map((log, index) => (
                  <div key={index} className={`py-0.5 ${index % 2 === 0 ? 'bg-muted/10' : ''}`}>
                     {log.message}
                  </div>
                ))}
              </pre>
            )}
          </ScrollArea>
        </div>

        <DialogFooter className="pt-4 border-t border-border/50">
          <Button variant="outline" onClick={clearServerLogs} disabled={isLoading} className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/50">
            <Trash2 className="mr-2 h-4 w-4" /> Clear Server Logs
          </Button>
          <div className="flex-grow"></div> {/* Spacer */}
          <Button variant="outline" onClick={fetchLogs} disabled={isLoading}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
          <DialogClose asChild>
            <Button variant="default">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
