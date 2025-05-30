
// src/app/api/catalog/download/route.ts
import { NextResponse } from 'next/server';
import { getCatalog } from '@/lib/catalog-store';
import * as XLSX from 'xlsx';
import type { EnrichedDataset, EnrichedTable, EnrichedColumn } from '@/types';

export async function GET() {
  try {
    const catalog = getCatalog();
    // Log a snippet of the catalog to help diagnose if it's empty
    console.log('[Download API] Catalog received:', JSON.stringify(catalog, null, 2).substring(0, 500) + (JSON.stringify(catalog, null, 2).length > 500 ? '...' : ''));

    if (!catalog || !catalog.datasets || catalog.datasets.length === 0) {
      console.warn('[Download API] Catalog is empty or has no datasets. Returning an Excel file with a notice.');
      const wb_empty = XLSX.utils.book_new();
      const ws_notice = XLSX.utils.json_to_sheet([{ Message: "The data catalog is currently empty. Please upload data first or ensure enrichment was successful." }]);
      XLSX.utils.book_append_sheet(wb_empty, ws_notice, 'Notice');
      const buf_empty = XLSX.write(wb_empty, { type: 'array', bookType: 'xlsx' });
      
      return new NextResponse(Buffer.from(buf_empty), {
        status: 200, 
        headers: {
          'Content-Disposition': `attachment; filename="catalog_notice.xlsx"`,
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      });
    }

    const rawDatasets: any[] = [];
    const rawTables: any[] = [];
    const rawColumns: any[] = [];

    catalog.datasets.forEach((ds: EnrichedDataset) => {
      rawDatasets.push({
        Dataset_name: ds.name ?? null,
        Dataset_description: ds.description ?? null,
        Tags: ds.tags ?? null,
        source: ds.source ?? null, 
        location: ds.location ?? null,
      });

      (ds.tables || []).forEach((tbl: EnrichedTable) => {
        rawTables.push({
          TABLE_NAME: tbl.name ?? null,
          Dataset_name: ds.name ?? null, 
          source: tbl.source ?? null, 
          location: tbl.location ?? null, 
          DATABASE_NAME: tbl.databaseName ?? null,
          SCHEMA_NAME: tbl.schemaName ?? null,
          OWNER: tbl.owner ?? null,
          PRIMARY_KEYS: tbl.primaryKeys ?? null,
          FOREIGN_KEYS: tbl.foreignKeys ?? null,
          CREATED_DATE: tbl.createdDate ?? null,
          UPDATED_DATE: tbl.updatedDate ?? null,
          Row_count: (tbl.rowCount !== undefined && tbl.rowCount !== null) ? String(tbl.rowCount) : null,
          Description: tbl.description ?? null, 
          Table_tags: tbl.tags ?? null, 
          Sensitivity: tbl.sensitivity ?? null,
        });

        (tbl.columns || []).forEach((col: EnrichedColumn) => {
          rawColumns.push({
            TABLE_NAME: tbl.name ?? null, 
            COLUMN_NAME: col.name ?? null,
            DATA_TYPE: col.dataType ?? null,
            PRIMARY_KEY: col.isPrimaryKey ? 'true' : 'false',
            FOREIGN_KEY: col.isForeignKey ? 'true' : 'false',
            column_description: col.description ?? null, 
            Column_tags: col.tags ?? null, 
            Sensitivity: col.sensitivity ?? null,
            location: col.location ?? null, 
          });
        });
      });
    });
    
    console.log(`[Download API] Populated rawDatasets: ${rawDatasets.length}, rawTables: ${rawTables.length}, rawColumns: ${rawColumns.length}`);

    const wb = XLSX.utils.book_new();
    const wsDatasets = XLSX.utils.json_to_sheet(rawDatasets, {header: ['Dataset_name', 'Dataset_description', 'Tags', 'source', 'location']});
    const wsTables = XLSX.utils.json_to_sheet(rawTables, {header: ['TABLE_NAME', 'Dataset_name', 'source', 'location', 'DATABASE_NAME', 'SCHEMA_NAME', 'OWNER', 'PRIMARY_KEYS', 'FOREIGN_KEYS', 'CREATED_DATE', 'UPDATED_DATE', 'Row_count', 'Description', 'Table_tags', 'Sensitivity']});
    const wsColumns = XLSX.utils.json_to_sheet(rawColumns, {header: ['TABLE_NAME', 'COLUMN_NAME', 'DATA_TYPE', 'PRIMARY_KEY', 'FOREIGN_KEY', 'column_description', 'Column_tags', 'Sensitivity', 'location']});

    XLSX.utils.book_append_sheet(wb, wsDatasets, 'datasets');
    XLSX.utils.book_append_sheet(wb, wsTables, 'tables');
    XLSX.utils.book_append_sheet(wb, wsColumns, 'columns');

    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    return new NextResponse(Buffer.from(buf), {
      status: 200,
      headers: {
        'Content-Disposition': `attachment; filename="enriched_catalog.xlsx"`,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    });

  } catch (error) {
    console.error('[Download API] Error generating Excel file:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred while generating the download file.';
    return NextResponse.json({ error: `Failed to generate Excel file: ${errorMessage}` }, { status: 500 });
  }
}

