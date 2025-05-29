
// src/app/admin/page.tsx
"use client";

import { FileUpload } from '@/components/admin/FileUpload';
import { MetadataTreeView } from '@/components/admin/MetadataTreeView';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UploadCloud, Eye } from 'lucide-react';


export default function AdminPage() {
  return (
    <div className="space-y-8">
      <Card className="border-border bg-transparent"> {/* Removed shadow-md, make card less prominent */}
        <CardHeader className="pb-4"> {/* Reduced bottom padding */}
          <CardTitle className="text-3xl font-bold tracking-tight">Admin Dashboard</CardTitle>
          <CardDescription>Manage your data catalog, enrich metadata, and download assets.</CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="upload" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:w-1/2 bg-secondary mb-2"> {/* Changed bg-muted to bg-secondary, added mb-2 */}
          <TabsTrigger value="upload" className="text-base py-2.5 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-none"> {/* More distinct active state */}
            <UploadCloud className="mr-2 h-5 w-5" /> Upload & Enrich
          </TabsTrigger>
          <TabsTrigger value="view" className="text-base py-2.5 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-none"> {/* More distinct active state */}
            <Eye className="mr-2 h-5 w-5" /> View Catalog
          </TabsTrigger>
        </TabsList>
        <TabsContent value="upload" className="mt-6">
          <FileUpload />
        </TabsContent>
        <TabsContent value="view" className="mt-6">
          <MetadataTreeView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
