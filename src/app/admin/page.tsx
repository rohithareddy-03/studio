// src/app/admin/page.tsx
"use client";

import { FileUpload } from '@/components/admin/FileUpload';
import { Card, CardDescription, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldCheck, BookOpenText, Terminal } from 'lucide-react';
import Link from 'next/link';

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
            Manage your data catalog, view API documentation for the external CSV-based catalog server, and perform other administrative tasks.
          </CardDescription>
        </CardHeader>
      </Card>

      <FileUpload />

      <Card className="bg-card/80 backdrop-blur-sm border-border/60 shadow-xl">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold text-primary flex items-center gap-3">
            <BookOpenText size={28} /> External Catalog Server
          </CardTitle>
          <CardDescription>
            View API documentation for the standalone Node.js server that reads catalog data from CSV files.
            This server runs independently on port 3001.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/admin/api-docs" passHref>
            <Button variant="outline" className="w-full h-11 text-base rounded-lg">
              <Terminal className="mr-2 h-5 w-5" />
              View API Documentation & Test Commands
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
