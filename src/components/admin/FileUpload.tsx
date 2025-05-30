
// src/components/admin/FileUpload.tsx
"use client";

import { useState, ChangeEvent, FormEvent } from 'react';
import { useCatalog } from '@/contexts/CatalogProvider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { UploadCloud, Loader2, Download, FileSpreadsheet } from 'lucide-react'; // Removed DatabaseZap
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function FileUpload() {
  const [file, setFile] = useState<File | null>(null);
  const { uploadFile, isLoading } = useCatalog(); // Removed reEnrich 

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    await uploadFile(file);
    setFile(null); 
    const fileInput = document.getElementById('file-upload-input') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  };

  const handleDownload = async () => {
    try {
      const response = await fetch('/api/catalog/download');
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'enriched_catalog.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download error:", error);
      // Consider adding a toast notification for download failure
    }
  };

  return (
    <Card className="bg-card/80 backdrop-blur-sm border-border/60 shadow-xl">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold text-primary flex items-center gap-3">
          <FileSpreadsheet size={28} /> Catalog File Management
        </CardTitle>
        <CardDescription>
          Upload your base data catalog file. Enrichment can be done per dataset/table in the Catalog Explorer.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label htmlFor="file-upload-input-main" className="text-lg font-medium text-foreground/90">Upload Catalog File</Label>
            <p className="text-sm text-muted-foreground mt-1">
              Upload an .xlsx file with 'datasets', 'tables', and 'columns' sheets.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="file-upload-input" className="text-sm font-medium">Excel File (.xlsx)</Label>
            <Input
              id="file-upload-input"
              type="file"
              accept=".xlsx"
              onChange={handleFileChange}
              className="file:text-primary file:font-semibold file:bg-primary/5 hover:file:bg-primary/10 h-11 rounded-lg"
              disabled={isLoading}
            />
            {file && <p className="text-xs text-muted-foreground pt-1.5">Selected: {file.name}</p>}
          </div>
          <Button type="submit" disabled={!file || isLoading} className="w-full h-11 text-base rounded-lg">
            {isLoading && file ? ( 
               <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <UploadCloud className="mr-2 h-5 w-5" />
            )}
            Upload Catalog File
          </Button>
        </form>

        <Separator className="my-6 bg-border/50" />

        <div>
          <h3 className="text-lg font-medium text-foreground/90 mb-1">Download Catalog</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Download the current state of your catalog, including any enrichments.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Button onClick={handleDownload} variant="outline" className="h-10 rounded-lg col-span-full sm:col-span-1"> {/* Make it full width on small, half on medium+ */}
              <Download className="mr-2 h-4 w-4" />
              Download Current Catalog
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
