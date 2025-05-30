
// src/app/api/catalog/update-raw-field/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { updateRawDataField } from '@/lib/catalog-store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { itemId, fieldKey, newValue } = body;

    if (!itemId || typeof itemId !== 'string') {
      return NextResponse.json({ error: 'itemId is required and must be a string' }, { status: 400 });
    }
    if (!fieldKey || (fieldKey !== 'description' && fieldKey !== 'tags')) {
      return NextResponse.json({ error: 'fieldKey must be "description" or "tags"' }, { status: 400 });
    }
    // newValue can be an empty string if the user clears a field.
    // Raw types expect string | null. We'll pass string, and catalog-store will handle null if needed.
    if (typeof newValue !== 'string') { 
      return NextResponse.json({ error: 'newValue must be a string' }, { status: 400 });
    }

    const success = updateRawDataField(itemId, fieldKey, newValue);

    if (success) {
      return NextResponse.json({ message: 'Raw data field updated successfully.' }, { status: 200 });
    } else {
      return NextResponse.json({ error: 'Failed to update raw data field. Item or field not found, or raw data not available.' }, { status: 404 });
    }

  } catch (error) {
    console.error('Update Raw Field API Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: `Failed to update raw data field: ${errorMessage}` }, { status: 500 });
  }
}
