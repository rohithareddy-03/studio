
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
        // If a canonical key is not found in excel (e.g. optional column entirely missing),
        // it remains undefined in newObj, which is fine for optional fields.
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
    
    // Parse sheets with defval: null to ensure empty cells are treated as null
    const parsedDatasets: any[] = XLSX.utils.sheet_to_json(datasetsSheet, { defval: null });
    const parsedTables: any[] = XLSX.utils.sheet_to_json(tablesSheet, { defval: null });
    const parsedColumns: any[] = XLSX.utils.sheet_to_json(columnsSheet, { defval: null });
    
    let validationError;

    if (parsedDatasets.length === 0) {
        return NextResponse.json({ error: 'Sheet \'datasets\' is empty or has no data. It must contain headers and at least one dataset.' }, { status: 400 });
    }
    validationError = validateHeaders(parsedDatasets, REQUIRED_DATASET_HEADERS, 'datasets');
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    
    // For tables and columns, header validation only runs if there's data.
    // If sheets are present but empty (only headers), sheet_to_json with defval:null might produce [{header1:null, header2:null,...}]
    // Or if truly empty (no headers even), it results in [].
    // The validateHeaders expects sheetData[0] to exist if there are headers.
    // Let's adjust: if parsedTables is [{...}] and all values are null, it means headers but no data.
    // Or if parsedTables is [], it means sheet was empty or only headers which yielded no objects.
    // Header validation for tables/columns is only critical if there are data rows.
    
    if (parsedTables.length > 0 && Object.values(parsedTables[0]).some(v => v !== null)) { // Check if there's at least one non-null value in the first row
        validationError = validateHeaders(parsedTables, REQUIRED_TABLE_HEADERS, 'tables');
        if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    } else if (parsedTables.length > 0 && !Object.values(parsedTables[0]).some(v => v !== null)) {
        // This means a row of all nulls, likely just headers. We can clear parsedTables.
        // Or, better, ensure validateHeaders can handle this. Let's assume for now it's okay if it's just headers.
        // The current validateHeaders might fail if it gets an object of all nulls but expects certain keys.
        // The logic for transformToCanonical and subsequent steps should handle empty arrays for tables/columns correctly.
    }


    if (parsedColumns.length > 0 && Object.values(parsedColumns[0]).some(v => v !== null)) {
        validationError = validateHeaders(parsedColumns, REQUIRED_COLUMN_HEADERS, 'columns');
        if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    }
    
    const firstDataset = parsedDatasets[0];
    const datasetNameKey = Object.keys(firstDataset).find(k => k.toLowerCase() === 'dataset_name');

    if (!datasetNameKey || firstDataset[datasetNameKey] === null || firstDataset[datasetNameKey] === '') {
      return NextResponse.json({ error: 'The first dataset in the "datasets" sheet must have a valid "Dataset_name".' }, { status: 400 });
    }

    const rawDatasets: RawDataset[] = transformToCanonical<RawDataset>(parsedDatasets, ALL_DATASET_KEYS);
    const rawTables: RawTable[] = transformToCanonical<RawTable>(parsedTables, ALL_TABLE_KEYS);
    const rawColumns: RawColumn[] = transformToCanonical<RawColumn>(parsedColumns, ALL_COLUMN_KEYS);

    storeRawDataForEnrichment({
      datasets: rawDatasets,
      tables: rawTables,
      columns: rawColumns,
    });

    const enrichedCatalog = await initializeCatalog(rawDatasets, rawTables, rawColumns);

    return NextResponse.json({ message: 'File uploaded and metadata enriched successfully', catalog: enrichedCatalog }, { status: 200 });

  } catch (error) {
    console.error('Upload API Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred during file upload.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

