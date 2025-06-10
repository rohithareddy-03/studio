// src/components/chat/ChatMessage.tsx
"use client";

import type { ChatMessage as ChatMessageType } from '@/types';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'; // Added AvatarImage
import { Bot, User, BrainCircuit } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.sender === 'user';

  return (
    <div className={cn("flex items-end gap-2.5 py-3 my-2.5", isUser ? "justify-end pl-10 sm:pl-16" : "pr-10 sm:pr-16")}>
      {!isUser && (
        <Avatar className="h-9 w-9 border-2 border-primary/30 shrink-0 bg-primary/10"> 
          <AvatarFallback className="bg-transparent"><BrainCircuit size={20} className="text-primary" /></AvatarFallback>
        </Avatar>
      )}
      <div
        className={cn(
          "max-w-[75%] rounded-xl p-3.5 text-sm shadow-md", 
          isUser
            ? "bg-primary text-primary-foreground rounded-br-none"
            : "bg-card text-card-foreground border border-border/50 rounded-bl-none" 
        )}
      >
        <div className="max-w-prose"> {/* Added wrapper with max-w-prose */}
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ node, inline, className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || '');
                return !inline && match ? (
                  <pre className="bg-muted/60 p-3 rounded-md overflow-x-auto my-2.5 text-xs font-mono border border-border/50">
                    <code className={className} {...props}>
                      {String(children).replace(/\n$/, '')}
                    </code>
                  </pre>
                ) : (
                  <code className={cn(className, "bg-muted/60 px-1.5 py-0.5 rounded text-xs font-mono")} {...props}>
                    {children}
                  </code>
                );
              },
              p({children}) {
                return <p className="mb-1.5 last:mb-0 leading-relaxed">{children}</p> 
              },
              ul({children}) {
                return <ul className="list-disc list-inside pl-3 my-2 space-y-1">{children}</ul> 
              },
              ol({children}) {
                return <ol className="list-decimal list-inside pl-3 my-2 space-y-1">{children}</ol> 
              },
              li({children}) {
                return <li className="mb-0.5">{children}</li> 
              },
              strong({children}) {
                return <strong className="font-semibold">{children}</strong>
              },
              a({children, href}) {
                return <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">{children}</a>
              }
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
        <p className={cn("text-xs mt-2 text-right opacity-70", isUser ? "text-primary-foreground/80" : "text-muted-foreground")}>
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
      {isUser && (
        <Avatar className="h-9 w-9 border-2 border-border/50 shrink-0 bg-secondary">
          <AvatarFallback className="bg-transparent"><User size={18} className="text-foreground/70" /></AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}
