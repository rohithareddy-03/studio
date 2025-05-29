
// src/app/admin/page.tsx
"use client";

import { FileUpload } from '@/components/admin/FileUpload';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function AdminPage() {
  return (
    <div className="space-y-8">
      <Card className="border-border bg-transparent">
        <CardHeader className="pb-4">
          <CardTitle className="text-3xl font-bold tracking-tight">Admin Dashboard</CardTitle>
          <CardDescription>Manage your data catalog: upload new data, re-enrich metadata, and download the current catalog.</CardDescription>
        </CardHeader>
      </Card>

      <FileUpload /> {/* FileUpload now contains upload and other actions */}
    </div>
  );
}
