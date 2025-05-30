
// src/app/api/catalog/enrich-table/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { enrichSingleTableInStore, getCatalog } from '@/lib/catalog-store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { datasetName, tableName } = body;

    if (!datasetName || typeof datasetName !== 'string') {
      return NextResponse.json({ error: 'datasetName is required and must be a string' }, { status: 400 });
    }
    if (!tableName || typeof tableName !== 'string') {
      return NextResponse.json({ error: 'tableName is required and must be a string' }, { status: 400 });
    }

    const enrichedTable = await enrichSingleTableInStore(datasetName, tableName);

    if (enrichedTable) {
      // Return the entire updated catalog for client to refresh
      const updatedCatalog = getCatalog();
      return NextResponse.json({ message: `Table '${tableName}' in dataset '${datasetName}' enriched successfully.`, catalog: updatedCatalog }, { status: 200 });
    } else {
      return NextResponse.json({ error: `Failed to enrich table '${tableName}' in dataset '${datasetName}'. It might not exist or an AI error occurred.` }, { status: 404 });
    }

  } catch (error) {
    console.error('Enrich Table API Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: `Failed to enrich table: ${errorMessage}` }, { status: 500 });
  }
}
