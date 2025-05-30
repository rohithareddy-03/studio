
// src/app/api/catalog/enrich-dataset/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { enrichSingleDatasetInStore, getCatalog } from '@/lib/catalog-store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { datasetName } = body;

    if (!datasetName || typeof datasetName !== 'string') {
      return NextResponse.json({ error: 'datasetName is required and must be a string' }, { status: 400 });
    }

    const enrichedDataset = await enrichSingleDatasetInStore(datasetName);

    if (enrichedDataset) {
      // Return the entire updated catalog for client to refresh if needed, or just success
      const updatedCatalog = getCatalog();
      return NextResponse.json({ message: `Dataset '${datasetName}' enriched successfully.`, catalog: updatedCatalog }, { status: 200 });
    } else {
      return NextResponse.json({ error: `Failed to enrich dataset '${datasetName}'. It might not exist or an AI error occurred.` }, { status: 404 });
    }

  } catch (error) {
    console.error('Enrich Dataset API Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: `Failed to enrich dataset: ${errorMessage}` }, { status: 500 });
  }
}
