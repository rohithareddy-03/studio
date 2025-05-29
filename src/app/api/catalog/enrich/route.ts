
// src/app/api/catalog/enrich/route.ts
import { NextResponse } from 'next/server';
import { reEnrichCatalog } from '@/lib/catalog-store';

export async function POST() {
  try {
    const newCatalog = await reEnrichCatalog();
    if (!newCatalog) {
      // Check if rawDataForEnrichment was null to provide a more specific message
      // This check needs to be done carefully, ideally reEnrichCatalog would signal this.
      // For now, assume null means AI enrichment phase failed or no raw data.
      return NextResponse.json({ error: 'Failed to re-enrich catalog. This could be due to an AI processing error or no initial data being available for enrichment.' }, { status: 400 });
    }
    return NextResponse.json({ message: 'Catalog re-enriched successfully.', catalog: newCatalog }, { status: 200 });
  } catch (error) {
    console.error('Re-enrich Catalog API Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred during re-enrichment.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
