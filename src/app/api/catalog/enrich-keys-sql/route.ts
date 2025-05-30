
// src/app/api/catalog/enrich-keys-sql/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { extractKeysFromSql, type ExtractKeysFromSqlOutput } from '@/ai/flows/extract-keys-from-sql-flow';
import { updateKeysFromSqlAnalysis, getCatalog, getDatasetByName, getTableByName } from '@/lib/catalog-store';
import type { RawTable, RawColumn } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sqlQuery, datasetName, tableName } = body;

    console.log('[Enrich Keys SQL API] Request body:', JSON.stringify(body, null, 2).substring(0, 500) + "...");


    if (!sqlQuery || typeof sqlQuery !== 'string') {
      return NextResponse.json({ error: 'sqlQuery is required and must be a string' }, { status: 400 });
    }
    if (!datasetName || typeof datasetName !== 'string') {
      return NextResponse.json({ error: 'datasetName is required and must be a string' }, { status: 400 });
    }
    if (tableName && typeof tableName !== 'string') {
      return NextResponse.json({ error: 'tableName must be a string if provided' }, { status: 400 });
    }

    const dataset = getDatasetByName(datasetName);
    if (!dataset) {
      return NextResponse.json({ error: `Dataset '${datasetName}' not found.` }, { status: 404 });
    }

    let existingSchemaContext = `Dataset: ${datasetName}\nTables and columns currently known:\n`;
    if (tableName) {
        const table = getTableByName(datasetName, tableName);
        if (table) {
            existingSchemaContext += `Table: ${table.name}\nColumns: ${table.columns.map(c => `${c.name} (${c.dataType || 'unknown type'})`).join(', ')}\n`;
        } else {
             return NextResponse.json({ error: `Table '${tableName}' not found in dataset '${datasetName}'.` }, { status: 404 });
        }
    } else {
        dataset.tables.forEach(table => {
            existingSchemaContext += `Table: ${table.name}\n  Columns: ${table.columns.map(c => `${c.name} (${c.dataType || 'unknown type'})`).join(', ')}\n`;
        });
    }


    const aiInput = { sqlQuery, datasetName, tableName, existingSchemaContext };
    console.log('[Enrich Keys SQL API] Input to extractKeysFromSql flow:', JSON.stringify(aiInput, null, 2).substring(0, 500) + "...");
    const aiKeyAnalysis: ExtractKeysFromSqlOutput = await extractKeysFromSql(aiInput);
    console.log('[Enrich Keys SQL API] Output from extractKeysFromSql flow (aiKeyAnalysis):', JSON.stringify(aiKeyAnalysis, null, 2).substring(0, 800) + "...");


    if (aiKeyAnalysis.warnings && aiKeyAnalysis.warnings.some(w => w.startsWith("Extraction failed:") || w.startsWith("AI returned no output.") || w.startsWith("AI analysis returned no output."))) {
      console.error('[Enrich Keys SQL API] AI Key Extraction failed:', aiKeyAnalysis.analysisSummary, aiKeyAnalysis.warnings);
      return NextResponse.json({ 
        error: `AI key extraction failed: ${aiKeyAnalysis.analysisSummary}`,
        summary: aiKeyAnalysis.analysisSummary, 
        warnings: aiKeyAnalysis.warnings 
      }, { status: 400 }); // Return 400 for AI-side processing errors
    }
    
    const success = updateKeysFromSqlAnalysis(datasetName, tableName, aiKeyAnalysis);

    if (success) {
      const updatedCatalog = getCatalog(); // Fetch the entire catalog to send back
      console.log('[Enrich Keys SQL API] Successfully updated keys. Returning updated catalog.');
      return NextResponse.json({ 
        message: 'Keys enriched successfully from SQL query.', 
        summary: aiKeyAnalysis.analysisSummary,
        primaryKeysFound: aiKeyAnalysis.primaryKeys,
        foreignKeysFound: aiKeyAnalysis.foreignKeys,
        warnings: aiKeyAnalysis.warnings,
        catalog: updatedCatalog 
      }, { status: 200 });
    } else {
      // This case might occur if updateKeysFromSqlAnalysis returns false for logical reasons not related to AI errors
      console.warn('[Enrich Keys SQL API] updateKeysFromSqlAnalysis returned false. Catalog might not have been updated as expected.', aiKeyAnalysis);
      return NextResponse.json({ 
        error: 'Failed to update catalog with extracted keys. No changes were made or an internal issue occurred.',
        summary: aiKeyAnalysis.analysisSummary,
        warnings: aiKeyAnalysis.warnings
      }, { status: 500 }); // 500 if catalog update logic failed
    }

  } catch (error) {
    console.error('[Enrich Keys SQL API] Error in POST handler:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: `Failed to enrich keys from SQL: ${errorMessage}` }, { status: 500 });
  }
}

