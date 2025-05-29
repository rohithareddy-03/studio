// src/app/api/chat/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { getDatasetByName, getTableMetadata } from '@/lib/catalog-store';
import { chatWithGemini, type ChatWithGeminiInput } from '@/ai/flows/chat-integration-with-gemini';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, selectedDatasetName } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query is required and must be a string' }, { status: 400 });
    }
    if (!selectedDatasetName || typeof selectedDatasetName !== 'string') {
      return NextResponse.json({ error: 'Selected dataset name is required' }, { status: 400 });
    }

    const dataset = getDatasetByName(selectedDatasetName);
    if (!dataset) {
      return NextResponse.json({ error: 'Selected dataset not found' }, { status: 404 });
    }

    const chatInput: ChatWithGeminiInput = {
      query: query,
      datasetDescription: dataset.description,
      // For simplicity, let's provide metadata for all tables in the selected dataset,
      // or Gemini can be prompted to ask for a specific table if needed.
      // A more sophisticated approach might parse the query to identify specific table mentions.
      tableMetadata: dataset.tables.map(table => getTableMetadata(dataset.name, table.name)).filter(Boolean).join('\n\n'),
    };
    
    const aiResponse = await chatWithGemini(chatInput);

    return NextResponse.json({ response: aiResponse.response }, { status: 200 });

  } catch (error) {
    console.error('Chat API Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred in the chat API.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
