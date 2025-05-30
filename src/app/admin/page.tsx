
// src/app/admin/page.tsx
"use client";

import { FileUpload } from '@/components/admin/FileUpload';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldCheck } from 'lucide-react';

export default function AdminPage() {
  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <Card className="border-transparent bg-gradient-to-br from-primary/10 to-accent/10 shadow-2xl overflow-hidden rounded-xl">
        <CardHeader className="pb-6">
          <div className="flex items-center gap-3 mb-2">
            <ShieldCheck size={32} className="text-primary" />
            <CardTitle className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary via-accent to-primary/80">
              Admin Control Panel
            </CardTitle>
          </div>
          <CardDescription className="text-base text-foreground/80">
            Manage your data catalog: upload new data, re-enrich metadata, and download the current catalog.
          </CardDescription>
        </CardHeader>
      </Card>

      <FileUpload />
    </div>
  );
}
