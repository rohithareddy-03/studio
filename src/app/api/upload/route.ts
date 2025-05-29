
// src/app/api/upload/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { initializeCatalog, storeRawDataForEnrichment } from '@/lib/catalog-store';
import type { RawDataset, RawTable, RawColumn } from '@/types';

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
    // If sheetData is empty (e.g., sheet exists but has no rows, or only header row which sheet_to_json might return as empty array),
    // we can't validate headers based on sheetData[0]. This case should be handled by checking if the sheet itself exists.
    // If it exists but is empty, it's not a header validation issue per se, but a lack of data.
    // Let's assume if sheetData is truly empty [], it's okay from a header perspective if data rows are optional.
    // However, for 'datasets', we require at least one data row.
    return null; 
  }
  const actualHeaders = Object.keys(sheetData[0]).map(h => h.toLowerCase());
  const requiredHeadersLower = requiredHeaders.map(h => h.toLowerCase());
  
  const missingHeaders = requiredHeadersLower.filter(reqHeader => !actualHeaders.includes(reqHeader));
  
  if (missingHeaders.length > 0) {
    // Find original casing for error message
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
      // Find the Excel key that matches the canonical key case-insensitively
      const excelKeyFound = excelKeys.find(ek => ek.toLowerCase() === (canonicalKey as string).toLowerCase());
      if (excelKeyFound) {
        (newObj as any)[canonicalKey] = obj[excelKeyFound];
      } else {
        // If a canonical key is not found in Excel data (e.g., an optional column was entirely missing from the sheet),
        // it remains undefined/omitted in newObj. This is generally fine for optional fields.
        // Zod schemas and types should handle optionality.
      }
    }
    return newObj as T;
  });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    if (file.type !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      return NextResponse.json({ error: 'Invalid file type. Only .xlsx is allowed.' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const workbook = XLSX.read(bytes, { type: 'array' });

    const datasetsSheet = workbook.Sheets['datasets'];
    const tablesSheet = workbook.Sheets['tables'];
    const columnsSheet = workbook.Sheets['columns'];

    if (!datasetsSheet) {
      return NextResponse.json({ error: "Missing required sheet: 'datasets'." }, { status: 400 });
    }
    if (!tablesSheet) {
      // Allow tables sheet to be optional or empty
      // return NextResponse.json({ error: "Missing required sheet: 'tables'." }, { status: 400 });
    }
    if (!columnsSheet) {
      // Allow columns sheet to be optional or empty
      // return NextResponse.json({ error: "Missing required sheet: 'columns'." }, { status: 400 });
    }
    
    const parsedDatasets: any[] = XLSX.utils.sheet_to_json(datasetsSheet, { defval: null });
    const parsedTables: any[] = tablesSheet ? XLSX.utils.sheet_to_json(tablesSheet, { defval: null }) : [];
    const parsedColumns: any[] = columnsSheet ? XLSX.utils.sheet_to_json(columnsSheet, { defval: null }) : [];
    
    let validationError;

    if (parsedDatasets.length === 0) {
        return NextResponse.json({ error: 'Sheet \'datasets\' is empty or has no data. It must contain headers and at least one dataset.' }, { status: 400 });
    }
    validationError = validateHeaders(parsedDatasets, REQUIRED_DATASET_HEADERS, 'datasets');
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    
    // Validate headers for tables and columns only if they have data rows.
    // parsedX.length > 0 implies there's at least one row of data (or a row of nulls if headers only).
    // Object.values(parsedX[0]).some(v => v !== null) checks if the first row isn't just all nulls.
    if (parsedTables.length > 0 && (parsedTables[0] && Object.values(parsedTables[0]).some(v => v !== null))) {
        validationError = validateHeaders(parsedTables, REQUIRED_TABLE_HEADERS, 'tables');
        if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    }

    if (parsedColumns.length > 0 && (parsedColumns[0] && Object.values(parsedColumns[0]).some(v => v !== null))) {
        validationError = validateHeaders(parsedColumns, REQUIRED_COLUMN_HEADERS, 'columns');
        if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    }
    
    // Ensure the first dataset has a name.
    const firstDatasetRaw = parsedDatasets[0];
    // Find the key for 'Dataset_name' case-insensitively
    const datasetNameKeyInRaw = Object.keys(firstDatasetRaw).find(k => k.toLowerCase() === 'dataset_name');
    if (!datasetNameKeyInRaw || firstDatasetRaw[datasetNameKeyInRaw] === null || firstDatasetRaw[datasetNameKeyInRaw] === '') {
      return NextResponse.json({ error: 'The first dataset in the "datasets" sheet must have a valid "Dataset_name".' }, { status: 400 });
    }

    const rawDatasets: RawDataset[] = transformToCanonical<RawDataset>(parsedDatasets, ALL_DATASET_KEYS);
    const rawTables: RawTable[] = transformToCanonical<RawTable>(parsedTables, ALL_TABLE_KEYS);
    const rawColumns: RawColumn[] = transformToCanonical<RawColumn>(parsedColumns, ALL_COLUMN_KEYS);

    storeRawDataForEnrichment({ // This stores the canonically cased raw data
      datasets: rawDatasets,
      tables: rawTables,
      columns: rawColumns,
    });

    const enrichedCatalog = await initializeCatalog(rawDatasets, rawTables, rawColumns);

    // --- Diagnostic Start ---
    try {
      // Attempt to stringify to check for serialization issues BEFORE NextResponse.json does.
      JSON.stringify(enrichedCatalog); 
    } catch (e: any) {
      console.error("Critical Error: Enriched catalog data is not serializable.", e.message, e.stack);
      // If stringify fails, this is a strong candidate for the root cause.
      return NextResponse.json({ error: "Internal error: Catalog data could not be processed for the response." }, { status: 500 });
    }
    // --- Diagnostic End ---

    return NextResponse.json({ message: 'File uploaded and metadata enriched successfully', catalog: enrichedCatalog }, { status: 200 });

  } catch (error: any) {
    console.error('Upload API Error:', error); // Log the full error object
    let simpleErrorMessage = 'An unexpected error occurred during file upload.';

    if (error && typeof error.message === 'string') {
      simpleErrorMessage = error.message.substring(0, 500); // Truncate to avoid overly long messages
    } else if (typeof error === 'string') {
      simpleErrorMessage = error.substring(0, 500); // Truncate
    }
    
    // Log more details if it's a complex object but not a standard Error instance
    if (error && typeof error === 'object' && !(error instanceof Error)) {
        try {
            console.error('Full error object (non-Error instance):', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        } catch (e) {
            console.error('Could not stringify the full error object.');
        }
    } else if (error instanceof Error && error.stack) {
        console.error('Error stack:', error.stack);
    }

    return NextResponse.json({ error: simpleErrorMessage }, { status: 500 });
  }
}
