
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
  const { uploadFile, isLoading, reEnrich } = useCatalog(); 

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
    <div className="space-y-8 p-6 md:p-8 border border-border rounded-lg bg-card"> {/* Increased padding */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <Label htmlFor="file-upload-input-main" className="text-xl font-semibold">Upload Catalog File</Label> {/* Increased size */}
          <p className="text-sm text-muted-foreground mt-1.5"> {/* Increased mt */}
            Upload an .xlsx file with 'datasets', 'tables', and 'columns' sheets to enrich and update the catalog.
          </p>
        </div>
        <div className="space-y-2.5"> {/* Increased space-y */}
          <Label htmlFor="file-upload-input">Excel File (.xlsx)</Label>
          <Input
            id="file-upload-input"
            type="file"
            accept=".xlsx"
            onChange={handleFileChange}
            className="file:text-primary file:font-semibold file:bg-primary/5 hover:file:bg-primary/10"
            disabled={isLoading}
          />
          {file && <p className="text-sm text-muted-foreground pt-1">Selected file: {file.name}</p>} {/* Added pt */}
        </div>
        <Button type="submit" disabled={!file || isLoading} className="w-full h-11 text-base"> {/* Increased size */}
          {isLoading && !file ? ( 
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> // Increased icon size
          ) : isLoading && file ? ( 
             <Loader2 className="mr-2 h-5 w-5 animate-spin" /> // Increased icon size
          ) : (
            <UploadCloud className="mr-2 h-5 w-5" /> // Increased icon size
          )}
          Upload and Enrich
        </Button>
      </form>

      <Separator />

      <div>
        <h3 className="text-xl font-semibold mb-1.5">Catalog Actions</h3> {/* Increased size and mb */}
        <p className="text-sm text-muted-foreground mb-5"> {/* Increased mb */}
          Perform actions on the currently loaded catalog data.
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <Button onClick={reEnrich} variant="outline" disabled={isLoading} className="flex-1 h-10"> {/* Adjusted size */}
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DatabaseZap className="mr-2 h-4 w-4" />}
            Re-enrich Current Catalog
          </Button>
          <Button onClick={handleDownload} variant="outline" className="flex-1 h-10"> {/* Adjusted size */}
            <Download className="mr-2 h-4 w-4" />
            Download Current Catalog
          </Button>
        </div>
      </div>
    </div>
  );
}
