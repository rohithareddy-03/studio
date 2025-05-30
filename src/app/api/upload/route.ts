// src/app/api/upload/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { initializeCatalog, storeRawDataForEnrichment } from '@/lib/catalog-store';
import type { RawDataset, RawTable, RawColumn } from '@/types';
import { addLog } from '@/lib/log-store'; // Import addLog

// Define required headers for each sheet (Canonical Casing for internal reference, matching logic is case-insensitive)
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

// Helper to get all canonical keys for a type. Used for transforming keys to canonical case.
const ALL_DATASET_KEYS: (keyof RawDataset)[] = ['Dataset_name', 'Dataset_description', 'Tags', 'source', 'location'];
const ALL_TABLE_KEYS: (keyof RawTable)[] = ['TABLE_NAME', 'Dataset_name', 'source', 'location', 'DATABASE_NAME', 'SCHEMA_NAME', 'OWNER', 'PRIMARY_KEYS', 'FOREIGN_KEYS', 'CREATED_DATE', 'UPDATED_DATE', 'Row_count', 'Description', 'Table_tags', 'Sensitivity'];
const ALL_COLUMN_KEYS: (keyof RawColumn)[] = ['TABLE_NAME', 'COLUMN_NAME', 'DATA_TYPE', 'PRIMARY_KEY', 'FOREIGN_KEY', 'column_description', 'Column_tags', 'Sensitivity', 'location'];


function validateHeaders(sheetData: any[], requiredHeaders: string[], sheetName: string): string | null {
  if (!sheetData || sheetData.length === 0) {
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
      if (excelKeyFound) {
        (newObj as any)[canonicalKey] = obj[excelKeyFound];
      } else {
        // If canonicalKey is not found, it remains undefined in newObj, which is fine for optional fields.
      }
    }
    return newObj as T;
  });
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
    const workbook = XLSX.read(bytes, { type: 'array' });

    const datasetsSheet = workbook.Sheets['datasets'];
    const tablesSheet = workbook.Sheets['tables'];
    const columnsSheet = workbook.Sheets['columns'];

    if (!datasetsSheet) {
      addLog("Upload API Error: Missing required sheet: 'datasets'.");
      return NextResponse.json({ error: "Missing required sheet: 'datasets'." }, { status: 400 });
    }
    
    const parsedDatasets: any[] = XLSX.utils.sheet_to_json(datasetsSheet, { defval: null });
    const parsedTables: any[] = tablesSheet ? XLSX.utils.sheet_to_json(tablesSheet, { defval: null }) : [];
    const parsedColumns: any[] = columnsSheet ? XLSX.utils.sheet_to_json(columnsSheet, { defval: null }) : [];
    
    addLog(`Upload API: Parsed datasets: ${parsedDatasets.length}, tables: ${parsedTables.length}, columns: ${parsedColumns.length}`);

    let validationError;

    if (parsedDatasets.length === 0) {
        addLog("Upload API Error: Sheet 'datasets' is empty or has no data rows.");
        return NextResponse.json({ error: 'Sheet \'datasets\' is empty or has no data. It must contain headers and at least one dataset.' }, { status: 400 });
    }
    validationError = validateHeaders(parsedDatasets, REQUIRED_DATASET_HEADERS, 'datasets');
    if (validationError) {
      addLog(`Upload API Error: Header validation failed for 'datasets': ${validationError}`);
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
    
    if (parsedTables.length > 0 && (parsedTables[0] && Object.values(parsedTables[0]).some(v => v !== null))) {
        validationError = validateHeaders(parsedTables, REQUIRED_TABLE_HEADERS, 'tables');
        if (validationError) {
          addLog(`Upload API Error: Header validation failed for 'tables': ${validationError}`);
          return NextResponse.json({ error: validationError }, { status: 400 });
        }
    }

    if (parsedColumns.length > 0 && (parsedColumns[0] && Object.values(parsedColumns[0]).some(v => v !== null))) {
        validationError = validateHeaders(parsedColumns, REQUIRED_COLUMN_HEADERS, 'columns');
        if (validationError) {
          addLog(`Upload API Error: Header validation failed for 'columns': ${validationError}`);
          return NextResponse.json({ error: validationError }, { status: 400 });
        }
    }
    
    const firstDatasetRaw = parsedDatasets[0];
    const datasetNameKeyInRaw = Object.keys(firstDatasetRaw).find(k => k.toLowerCase() === 'dataset_name');
    if (!datasetNameKeyInRaw || firstDatasetRaw[datasetNameKeyInRaw] === null || String(firstDatasetRaw[datasetNameKeyInRaw]).trim() === '') {
      addLog("Upload API Error: The first dataset in 'datasets' sheet must have a valid 'Dataset_name'.");
      return NextResponse.json({ error: 'The first dataset in the "datasets" sheet must have a valid "Dataset_name".' }, { status: 400 });
    }

    const rawDatasets: RawDataset[] = transformToCanonical<RawDataset>(parsedDatasets, ALL_DATASET_KEYS);
    const rawTables: RawTable[] = transformToCanonical<RawTable>(parsedTables, ALL_TABLE_KEYS);
    const rawColumns: RawColumn[] = transformToCanonical<RawColumn>(parsedColumns, ALL_COLUMN_KEYS);

    addLog("Upload API: Storing raw data for potential enrichment and initializing catalog...");
    storeRawDataForEnrichment({ 
      datasets: rawDatasets,
      tables: rawTables,
      columns: rawColumns,
    });

    const enrichedCatalog = await initializeCatalog(rawDatasets, rawTables, rawColumns);
    addLog("Upload API: Catalog initialization complete.");

    try {
      JSON.stringify(enrichedCatalog); 
    } catch (e: any) {
      addLog(`Upload API Critical Error: Enriched catalog data is not serializable. Error: ${e.message}`);
      console.error("Upload API Critical Error: Enriched catalog data is not serializable.", e.message, e.stack);
      return NextResponse.json({ error: "Internal error: Catalog data could not be processed for the response." }, { status: 500 });
    }

    addLog("Upload API: File uploaded and catalog processed successfully. Returning response.");
    return NextResponse.json({ message: 'File uploaded and catalog processed successfully.', catalog: enrichedCatalog }, { status: 200 });

  } catch (error: any) {
    addLog(`Upload API Error: An unexpected error occurred. Error: ${error.message}`);
    console.error('Upload API Error:', error); 
    let simpleErrorMessage = 'An unexpected error occurred during file upload.';

    if (error && typeof error.message === 'string') {
      simpleErrorMessage = error.message.substring(0, 500); 
    } else if (typeof error === 'string') {
      simpleErrorMessage = error.substring(0, 500); 
    }
    
    if (error && typeof error === 'object' && !(error instanceof Error)) {
        try {
            console.error('Upload API Full error object (non-Error instance):', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        } catch (e) {
            console.error('Upload API: Could not stringify the full error object.');
        }
    } else if (error instanceof Error && error.stack) {
        console.error('Upload API Error stack:', error.stack);
    }

    return NextResponse.json({ error: simpleErrorMessage }, { status: 500 });
  }
}
