// src/components/admin/FileUpload.tsx
"use client";

import { useState, ChangeEvent, FormEvent } from 'react';
import { useCatalog } from '@/contexts/CatalogProvider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { UploadCloud, Loader2 } from 'lucide-react';

export function FileUpload() {
  const [file, setFile] = useState<File | null>(null);
  const { uploadFile, isLoading } = useCatalog();

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    await uploadFile(file);
    setFile(null); // Reset file input after upload
    // Clear the actual input field value
    const fileInput = document.getElementById('file-upload-input') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 p-6 border rounded-lg shadow-sm bg-card">
      <div>
        <Label htmlFor="file-upload-input" className="text-lg font-semibold">Upload Catalog File</Label>
        <p className="text-sm text-muted-foreground mt-1">
          Upload an .xlsx file with 'datasets', 'tables', and 'columns' sheets to enrich and update the catalog.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="file-upload-input">Excel File (.xlsx)</Label>
        <Input
          id="file-upload-input"
          type="file"
          accept=".xlsx"
          onChange={handleFileChange}
          className="file:text-primary file:font-semibold file:bg-primary/10 hover:file:bg-primary/20"
          disabled={isLoading}
        />
        {file && <p className="text-sm text-muted-foreground">Selected file: {file.name}</p>}
      </div>
      <Button type="submit" disabled={!file || isLoading} className="w-full">
        {isLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <UploadCloud className="mr-2 h-4 w-4" />
        )}
        Upload and Enrich
      </Button>
    </form>
  );
}
