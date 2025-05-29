
// src/app/api/upload/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { initializeCatalog, storeRawDataForEnrichment } from '@/lib/catalog-store';
import type { RawDataset, RawTable, RawColumn } from '@/types';

// Define required headers for each sheet (Canonical Casing)
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

// Helper to get all canonical keys for a type (approximated by combining required and known optional fields)
// This is for the transformation step to ensure all relevant fields are considered.
const ALL_DATASET_KEYS: (keyof RawDataset)[] = ['Dataset_name', 'Dataset_description', 'Tags', 'source', 'location'];
const ALL_TABLE_KEYS: (keyof RawTable)[] = ['TABLE_NAME', 'Dataset_name', 'source', 'location', 'DATABASE_NAME', 'SCHEMA_NAME', 'OWNER', 'PRIMARY_KEYS', 'FOREIGN_KEYS', 'CREATED_DATE', 'UPDATED_DATE', 'Row_count', 'Description', 'Table_tags', 'Sensitivity'];
const ALL_COLUMN_KEYS: (keyof RawColumn)[] = ['TABLE_NAME', 'COLUMN_NAME', 'DATA_TYPE', 'PRIMARY_KEY', 'FOREIGN_KEY', 'column_description', 'Column_tags', 'Sensitivity', 'location'];


function validateHeaders(sheetData: any[], requiredHeaders: string[], sheetName: string): string | null {
  if (!sheetData || sheetData.length === 0) {
    // This case should ideally be caught before calling validateHeaders if sheets can be truly empty (no headers row).
    // If sheetData[0] is undefined because the sheet was empty, XLSX.utils.sheet_to_json([]) results in [].
    // The check `if (rawDatasets.length > 0)` etc. before calling this function handles empty data arrays.
    // So, sheetData here is expected to have at least one object (from the header row if data exists, or an empty array if sheet was empty).
    // If sheet_to_json produced an empty array, the caller won't call validateHeaders.
    // If sheet_to_json produced an array of objects, sheetData[0] will exist.
    return null; 
  }
  const actualHeaders = Object.keys(sheetData[0]).map(h => h.toLowerCase());
  const requiredHeadersLower = requiredHeaders.map(h => h.toLowerCase());
  
  const missingHeaders = requiredHeadersLower.filter(reqHeader => !actualHeaders.includes(reqHeader));
  
  if (missingHeaders.length > 0) {
    // Find original casing for missing headers to display in error
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
      return NextResponse.json({ error: "Missing required sheet: 'tables'." }, { status: 400 });
    }
    if (!columnsSheet) {
      return NextResponse.json({ error: "Missing required sheet: 'columns'." }, { status: 400 });
    }
    
    // sheet_to_json will use the casing from the Excel file for keys
    const parsedDatasets: any[] = XLSX.utils.sheet_to_json(datasetsSheet);
    const parsedTables: any[] = XLSX.utils.sheet_to_json(tablesSheet);
    const parsedColumns: any[] = XLSX.utils.sheet_to_json(columnsSheet);
    
    let validationError;
    // Validate headers for each sheet
    // For datasets, it must not be empty and must have headers.
    if (parsedDatasets.length === 0) {
        return NextResponse.json({ error: 'Sheet \'datasets\' is empty or has no data. It must contain headers and at least one dataset.' }, { status: 400 });
    }
    validationError = validateHeaders(parsedDatasets, REQUIRED_DATASET_HEADERS, 'datasets');
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    
    if (parsedTables.length > 0) {
        validationError = validateHeaders(parsedTables, REQUIRED_TABLE_HEADERS, 'tables');
        if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    }

    if (parsedColumns.length > 0) {
        validationError = validateHeaders(parsedColumns, REQUIRED_COLUMN_HEADERS, 'columns');
        if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    }
    
    // Basic data presence validation
    if (parsedDatasets.length === 0) { // This check is technically redundant due to the one above, but kept for clarity.
        return NextResponse.json({ error: 'Datasets sheet must contain at least one dataset.' }, { status: 400 });
    }
    // Check if Dataset_name exists after potential case variations
    const firstDataset = parsedDatasets[0];
    const datasetNameKey = Object.keys(firstDataset).find(k => k.toLowerCase() === 'dataset_name');
    if (!datasetNameKey || !firstDataset[datasetNameKey]) {
      return NextResponse.json({ error: 'The first dataset in the "datasets" sheet must have a "Dataset_name".' }, { status: 400 });
    }

    // Transform data to use canonical casing for keys
    const rawDatasets: RawDataset[] = transformToCanonical<RawDataset>(parsedDatasets, ALL_DATASET_KEYS);
    const rawTables: RawTable[] = transformToCanonical<RawTable>(parsedTables, ALL_TABLE_KEYS);
    const rawColumns: RawColumn[] = transformToCanonical<RawColumn>(parsedColumns, ALL_COLUMN_KEYS);

    // Store raw data (now with canonical keys) for potential re-enrichment later
    storeRawDataForEnrichment({
      datasets: rawDatasets,
      tables: rawTables,
      columns: rawColumns,
    });

    // Initialize catalog (which includes AI enrichment)
    const enrichedCatalog = await initializeCatalog(rawDatasets, rawTables, rawColumns);

    return NextResponse.json({ message: 'File uploaded and metadata enriched successfully', catalog: enrichedCatalog }, { status: 200 });

  } catch (error) {
    console.error('Upload API Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred during file upload.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
