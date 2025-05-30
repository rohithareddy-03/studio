
// src/app/api/catalog/enrich/route.ts
// THIS ROUTE IS NO LONGER USED FOR GLOBAL ENRICHMENT.
// Enrichment is now handled at individual dataset/table levels.
// Keeping the file to avoid 404s if old client code tries to hit it, but it will do nothing.
import { NextResponse } from 'next/server';

export async function POST() {
  console.warn("POST /api/catalog/enrich is deprecated. Enrichment is now per-dataset/table.");
  return NextResponse.json({ message: 'This global enrichment endpoint is deprecated. Use per-dataset or per-table enrichment.', catalog: null }, { status: 410 }); // 410 Gone
}
