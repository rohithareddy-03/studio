
// src/components/admin/FileUpload.tsx
"use client";

import { useState, ChangeEvent, FormEvent } from 'react';
import { useCatalog } from '@/contexts/CatalogProvider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { UploadCloud, Loader2, Download, DatabaseZap } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

export function FileUpload() {
  const [file, setFile] = useState<File | null>(null);
  const { uploadFile, isLoading, reEnrich } = useCatalog(); // Added reEnrich

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
      // Consider adding a toast notification for download failure using useToast
    }
  };

  return (
    <div className="space-y-6 p-6 border border-border rounded-lg bg-card">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <Label htmlFor="file-upload-input-main" className="text-lg font-semibold">Upload Catalog File</Label>
          <p className="text-sm text-muted-foreground mt-1">
            Upload an .xlsx file with 'datasets', 'tables', and 'columns' sheets to enrich and update the catalog.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="file-upload-input">Excel File (.xlsx)</Label>
          <Input
            id="file-upload-input" // Kept original ID for reset logic
            type="file"
            accept=".xlsx"
            onChange={handleFileChange}
            className="file:text-primary file:font-semibold file:bg-primary/5 hover:file:bg-primary/10"
            disabled={isLoading}
          />
          {file && <p className="text-sm text-muted-foreground">Selected file: {file.name}</p>}
        </div>
        <Button type="submit" disabled={!file || isLoading} className="w-full">
          {isLoading && !file ? ( // General loading state
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : isLoading && file ? ( // Loading specifically for upload
             <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <UploadCloud className="mr-2 h-4 w-4" />
          )}
          Upload and Enrich
        </Button>
      </form>

      <Separator />

      <div>
        <h3 className="text-lg font-semibold mb-1">Catalog Actions</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Perform actions on the currently loaded catalog data.
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <Button onClick={reEnrich} variant="outline" disabled={isLoading} className="flex-1">
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DatabaseZap className="mr-2 h-4 w-4" />}
            Re-enrich Current Catalog
          </Button>
          <Button onClick={handleDownload} variant="outline" className="flex-1">
            <Download className="mr-2 h-4 w-4" />
            Download Current Catalog
          </Button>
        </div>
      </div>
    </div>
  );
}
