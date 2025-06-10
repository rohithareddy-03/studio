
// src/app/api/catalog/search-datasets/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { getCatalog } from '@/lib/catalog-store';
import type { EnrichedDataset } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query')?.toLowerCase().trim() || '';

    const catalog = getCatalog(); // This loads from memory or disk

    if (!catalog || !catalog.datasets || catalog.datasets.length === 0) {
      return NextResponse.json({ datasets: [] }, { status: 200 });
    }

    if (!query) {
      // If query is empty, return all datasets
      return NextResponse.json({ datasets: catalog.datasets }, { status: 200 });
    }

    const filteredDatasets = catalog.datasets.filter(dataset => {
      const nameMatch = dataset.name.toLowerCase().includes(query);
      const descriptionMatch = dataset.description?.toLowerCase().includes(query);
      const tagsMatch = dataset.tags?.toLowerCase().includes(query);
      return nameMatch || descriptionMatch || tagsMatch;
    });

    return NextResponse.json({ datasets: filteredDatasets }, { status: 200 });

  } catch (error) {
    console.error('Search Datasets API Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: `Failed to search datasets: ${errorMessage}` }, { status: 500 });
  }
}
