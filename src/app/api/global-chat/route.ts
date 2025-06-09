
// src/app/api/global-chat/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { getCatalog } from '@/lib/catalog-store';
import { globalCatalogChat, type GlobalCatalogChatInput } from '@/ai/flows/global-catalog-chat-flow';
import type { ChatMessageHistory } from '@/ai/flows/chat-integration-with-gemini'; // Reusing this type

function generateCatalogSummary(catalogData: ReturnType<typeof getCatalog>): string {
  if (!catalogData || !catalogData.datasets || catalogData.datasets.length === 0) {
    return "The data catalog is currently empty.";
  }
  let summary = "Full Data Catalog Overview:\n\n";
  catalogData.datasets.forEach(dataset => {
    summary += `Dataset: ${dataset.name}\n`;
    summary += `  Description: ${dataset.description || 'N/A'}\n`;
    summary += `  Tags: ${dataset.tags || 'N/A'}\n`;
    if (dataset.tables && dataset.tables.length > 0) {
      summary += `  Tables (${dataset.tables.length}):\n`;
      dataset.tables.forEach(table => {
        summary += `    - ${table.name} (Description: ${table.description || 'N/A'}, Columns: ${table.columns.length})\n`;
        // Optionally list a few key columns for each table
        // table.columns.slice(0, 3).forEach(col => {
        //   summary += `      -- ${col.name} (Type: ${col.dataType || 'N/A'})\n`;
        // });
      });
    } else {
      summary += "  Tables: No tables in this dataset.\n";
    }
    summary += "\n";
  });
  return summary;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, history } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query is required and must be a string' }, { status: 400 });
    }
    if (history && !Array.isArray(history)) {
        return NextResponse.json({ error: 'History must be an array of chat messages' }, { status: 400 });
    }

    const currentCatalog = getCatalog();
    const catalogSummary = generateCatalogSummary(currentCatalog);

    const chatInput: GlobalCatalogChatInput = {
      query: query,
      catalogSummary: catalogSummary,
      history: history as ChatMessageHistory[] || [],
    };
    
    const aiResponse = await globalCatalogChat(chatInput);

    return NextResponse.json({ response: aiResponse.response }, { status: 200 });

  } catch (error) {
    console.error('Global Chat API Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred in the global chat API.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
