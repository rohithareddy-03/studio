// src/app/api/upload/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { initializeCatalog, storeRawDataForEnrichment } from '@/lib/catalog-store';
import type { RawDataset, RawTable, RawColumn } from '@/types';

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

    if (!datasetsSheet || !tablesSheet || !columnsSheet) {
      return NextResponse.json({ error: 'Invalid Excel file structure. Missing required sheets: datasets, tables, columns.' }, { status: 400 });
    }

    const rawDatasets: RawDataset[] = XLSX.utils.sheet_to_json(datasetsSheet);
    const rawTables: RawTable[] = XLSX.utils.sheet_to_json(tablesSheet);
    const rawColumns: RawColumn[] = XLSX.utils.sheet_to_json(columnsSheet);
    
    // Validate basic structure
    if (!rawDatasets.length || !rawDatasets[0]?.Dataset_name) {
        return NextResponse.json({ error: 'Datasets sheet is empty or missing "Dataset_name" column.' }, { status: 400 });
    }
    if (rawTables.length > 0 && (!rawTables[0]?.TABLE_NAME || !rawTables[0]?.Dataset_name)) {
         return NextResponse.json({ error: 'Tables sheet is missing "TABLE_NAME" or "Dataset_name" column.' }, { status: 400 });
    }
    if (rawColumns.length > 0 && (!rawColumns[0]?.TABLE_NAME || !rawColumns[0]?.COLUMN_NAME)) {
         return NextResponse.json({ error: 'Columns sheet is missing "TABLE_NAME" or "COLUMN_NAME" column.' }, { status: 400 });
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
