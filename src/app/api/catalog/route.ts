// src/app/api/catalog/route.ts
import { NextResponse } from 'next/server';
import { getCatalog } from '@/lib/catalog-store';

export async function GET() {
  try {
    const catalog = getCatalog();
    return NextResponse.json(catalog, { status: 200 });
  } catch (error) {
    console.error('Catalog API Error:', error);
    return NextResponse.json({ error: 'Failed to fetch catalog data' }, { status: 500 });
  }
}
