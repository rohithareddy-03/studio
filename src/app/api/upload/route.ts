
// src/app/api/upload/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { initializeCatalog, processUploadedFileAndInitializeCatalog, storeRawDataForEnrichment } from '@/lib/catalog-store';
import type { RawDataset, RawTable, RawColumn } from '@/types';
import { addLog } from '@/lib/log-store';
import fs from 'fs';
import path from 'path';

const CSV_DATA_STORE_DIR = path.join(process.cwd(), 'public', 'csv_data_store');
const CATALOG_XLSX_FILE_PATH = path.join(CSV_DATA_STORE_DIR, 'catalog.xlsx');

// Define required headers for each sheet
const REQUIRED_DATASET_HEADERS = ['Dataset_name', 'Dataset_description', 'Tags', 'source', 'location'];
const REQUIRED_TABLE_HEADERS = [
  'TABLE_NAME', 'Dataset_name', 'source', 'location', 'DATABASE_NAME', 'SCHEMA_NAME',
  'OWNER', 'PRIMARY_KEYS', 'FOREIGN_KEYS', 'CREATED_DATE', 'UPDATED_DATE',
  'Row_count', 'Description', 'Table_tags', 'Sensitivity'
];
const REQUIRED_COLUMN_HEADERS = [
  'TABLE_NAME', 'COLUMN_NAME', 'DATA_TYPE', 'PRIMARY_KEY', 'FOREIGN_KEY',
  'column_description', 'Column_tags', 'Sensitivity', 'location'
];

const ALL_DATASET_KEYS: (keyof RawDataset)[] = ['Dataset_name', 'Dataset_description', 'Tags', 'source', 'location'];
const ALL_TABLE_KEYS: (keyof RawTable)[] = ['TABLE_NAME', 'Dataset_name', 'source', 'location', 'DATABASE_NAME', 'SCHEMA_NAME', 'OWNER', 'PRIMARY_KEYS', 'FOREIGN_KEYS', 'CREATED_DATE', 'UPDATED_DATE', 'Row_count', 'Description', 'Table_tags', 'Sensitivity'];
const ALL_COLUMN_KEYS: (keyof RawColumn)[] = ['TABLE_NAME', 'COLUMN_NAME', 'DATA_TYPE', 'PRIMARY_KEY', 'FOREIGN_KEY', 'column_description', 'Column_tags', 'Sensitivity', 'location'];


function validateHeaders(sheetData: any[], requiredHeaders: string[], sheetName: string): string | null {
  if (!sheetData || sheetData.length === 0) {
    // If sheet is empty but optional (like tables or columns), it's not an error.
    // If sheet is 'datasets' and empty, it IS an error (handled later).
    return null;
  }
  const actualHeaders = Object.keys(sheetData[0]).map(h => h.toLowerCase());
  const requiredHeadersLower = requiredHeaders.map(h => h.toLowerCase());

  const missingHeaders = requiredHeadersLower.filter(reqHeader => !actualHeaders.includes(reqHeader));

  if (missingHeaders.length > 0) {
    const originalCaseMissingHeaders = requiredHeaders.filter(rh => missingHeaders.includes(rh.toLowerCase()));
    return `Sheet '${sheetName}' is missing required columns (case-insensitive check): ${originalCaseMissingHeaders.join(', ')}. Please ensure all required headers are present.`;
  }
  return null;
}

function transformToCanonical<T extends object>(parsedData: any[], allCanonicalKeys: (keyof T)[]): T[] {
  return parsedData.map(obj => {
    const newObj: Partial<T> = {};
    const excelKeys = Object.keys(obj);

    for (const canonicalKey of allCanonicalKeys) {
      const excelKeyFound = excelKeys.find(ek => ek.toLowerCase() === (canonicalKey as string).toLowerCase());
      if (excelKeyFound && obj[excelKeyFound] !== null && obj[excelKeyFound] !== undefined) {
        (newObj as any)[canonicalKey] = obj[excelKeyFound];
      } else {
        (newObj as any)[canonicalKey] = null; // Ensure all keys are present, defaulting to null if missing or empty in Excel
      }
    }
    return newObj as T;
  });
}

function ensureDataStoreDirectoryExists() {
  if (!fs.existsSync(CSV_DATA_STORE_DIR)) {
    fs.mkdirSync(CSV_DATA_STORE_DIR, { recursive: true });
    addLog(`[Upload API] Created directory ${CSV_DATA_STORE_DIR}`);
  }
}

export async function POST(request: NextRequest) {
  try {
    addLog("Upload API: Received new file upload request.");
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      addLog("Upload API Error: No file uploaded.");
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }
    addLog(`Upload API: Processing file: ${file.name}, type: ${file.type}, size: ${file.size} bytes.`);

    if (file.type !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      addLog(`Upload API Error: Invalid file type: ${file.type}.`);
      return NextResponse.json({ error: 'Invalid file type. Only .xlsx is allowed.' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    ensureDataStoreDirectoryExists();

    try {
      fs.writeFileSync(CATALOG_XLSX_FILE_PATH, Buffer.from(bytes));
      addLog(`Upload API: File successfully saved to ${CATALOG_XLSX_FILE_PATH}`);
    } catch (saveError: any) {
      addLog(`Upload API Error: Failed to save file to ${CATALOG_XLSX_FILE_PATH}. Error: ${saveError.message}`);
      console.error('File save error:', saveError);
      return NextResponse.json({ error: `Failed to save uploaded file: ${saveError.message}` }, { status: 500 });
    }

    // Now that the file is saved, let catalog-store handle reading it and initializing
    const newCatalogData = await processUploadedFileAndInitializeCatalog();
    addLog("Upload API: Catalog re-initialized from newly uploaded and saved file.");

    if (!newCatalogData || newCatalogData.datasets.length === 0) {
        // This might happen if the excel file was empty or malformed
        // processUploadedFileAndInitializeCatalog would log details
        addLog("Upload API Error: Catalog is empty after processing the uploaded file. Check file contents and logs.");
        return NextResponse.json({ error: 'Uploaded file processed, but resulted in an empty catalog. Please check the file format and content.' }, { status: 400 });
    }
    
    return NextResponse.json({ message: 'File uploaded, saved, and catalog processed successfully.', catalog: newCatalogData }, { status: 200 });

  } catch (error: any) {
    addLog(`Upload API Error: An unexpected error occurred. Error: ${error.message}`);
    console.error('Upload API Error:', error);
    let simpleErrorMessage = 'An unexpected error occurred during file upload.';

    if (error && typeof error.message === 'string') {
      simpleErrorMessage = error.message.substring(0, 500);
    } else if (typeof error === 'string') {
      simpleErrorMessage = error.substring(0, 500);
    }
    return NextResponse.json({ error: simpleErrorMessage }, { status: 500 });
  }
}
