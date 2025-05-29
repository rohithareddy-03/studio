
// src/app/api/upload/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { initializeCatalog, storeRawDataForEnrichment } from '@/lib/catalog-store';
import type { RawDataset, RawTable, RawColumn } from '@/types';

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

function validateHeaders(sheetData: any[], requiredHeaders: string[], sheetName: string): string | null {
  if (!sheetData || sheetData.length === 0) {
    // Allow empty sheets as per original behavior, but if not empty, headers are checked
    // For stricter validation (sheet must exist and have headers even if no data rows):
    // return `Sheet '${sheetName}' is empty or headers could not be read.`;
    return null; 
  }
  const headers = Object.keys(sheetData[0]);
  const missingHeaders = requiredHeaders.filter(header => !headers.includes(header));
  if (missingHeaders.length > 0) {
    return `Sheet '${sheetName}' is missing required columns: ${missingHeaders.join(', ')}.`;
  }
  return null;
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
    
    const rawDatasets: RawDataset[] = XLSX.utils.sheet_to_json(datasetsSheet);
    const rawTables: RawTable[] = XLSX.utils.sheet_to_json(tablesSheet);
    const rawColumns: RawColumn[] = XLSX.utils.sheet_to_json(columnsSheet);
    
    // Validate headers for each sheet
    let validationError = validateHeaders(rawDatasets, REQUIRED_DATASET_HEADERS, 'datasets');
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    
    // For tables and columns, check headers only if there's data (or enforce non-empty sheets if desired)
    if (rawTables.length > 0) {
        validationError = validateHeaders(rawTables, REQUIRED_TABLE_HEADERS, 'tables');
        if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    } else {
        // If tables sheet is empty, it implies no tables, which is acceptable if datasets can exist without tables.
        // If tables are mandatory for any dataset, further logic would be needed.
    }

    if (rawColumns.length > 0) {
        validationError = validateHeaders(rawColumns, REQUIRED_COLUMN_HEADERS, 'columns');
        if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    } else {
        // Similar to tables, columns sheet can be empty if tables can exist without detailed columns.
    }
    
    // Basic data presence validation (at least one dataset must exist with a name)
    if (rawDatasets.length === 0 || !rawDatasets[0]?.Dataset_name) {
        return NextResponse.json({ error: 'Datasets sheet must contain at least one dataset with a "Dataset_name".' }, { status: 400 });
    }

    // Store raw data for potential re-enrichment later
    storeRawDataForEnrichment({
      datasets: rawDatasets.map(d => ({ ...d })),
      tables: rawTables.map(t => ({ ...t })),
      columns: rawColumns.map(c => ({ ...c })),
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

