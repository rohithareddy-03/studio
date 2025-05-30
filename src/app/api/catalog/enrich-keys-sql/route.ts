
// src/app/api/catalog/enrich-keys-sql/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { extractKeysFromSql, type ExtractKeysFromSqlOutput } from '@/ai/flows/extract-keys-from-sql-flow';
import { updateKeysFromSqlAnalysis, getCatalog, getDatasetByName, getTableByName } from '@/lib/catalog-store';
import type { RawTable, RawColumn } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sqlQuery, datasetName, tableName } = body;

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
    const aiKeyAnalysis: ExtractKeysFromSqlOutput = await extractKeysFromSql(aiInput);

    if (aiKeyAnalysis.warnings && aiKeyAnalysis.warnings.some(w => w.startsWith("Extraction failed:") || w.startsWith("AI returned no output."))) {
      console.error('AI Key Extraction failed:', aiKeyAnalysis.analysisSummary, aiKeyAnalysis.warnings);
      return NextResponse.json({ 
        error: `AI key extraction failed: ${aiKeyAnalysis.analysisSummary}`,
        summary: aiKeyAnalysis.analysisSummary, 
        warnings: aiKeyAnalysis.warnings 
      }, { status: 400 });
    }
    
    const success = updateKeysFromSqlAnalysis(datasetName, tableName, aiKeyAnalysis);

    if (success) {
      const updatedCatalog = getCatalog(); // Fetch the entire catalog to send back
      return NextResponse.json({ 
        message: 'Keys enriched successfully from SQL query.', 
        summary: aiKeyAnalysis.analysisSummary,
        primaryKeysFound: aiKeyAnalysis.primaryKeys,
        foreignKeysFound: aiKeyAnalysis.foreignKeys,
        warnings: aiKeyAnalysis.warnings,
        catalog: updatedCatalog 
      }, { status: 200 });
    } else {
      return NextResponse.json({ 
        error: 'Failed to update catalog with extracted keys. See server logs for details.',
        summary: aiKeyAnalysis.analysisSummary,
        warnings: aiKeyAnalysis.warnings
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Enrich Keys via SQL API Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: `Failed to enrich keys from SQL: ${errorMessage}` }, { status: 500 });
  }
}
