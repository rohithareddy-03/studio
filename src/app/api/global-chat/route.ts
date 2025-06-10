// This file can be deleted.
// Global Catalog Chat functionality has been removed.
import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ error: 'This endpoint is no longer active.' }, { status: 410 });
}
