// src/app/api/catalog/download/route.ts
import { NextResponse } from 'next/server';
import { getCatalog } from '@/lib/catalog-store';
import * as XLSX from 'xlsx';
import type { EnrichedDataset, EnrichedTable, EnrichedColumn } from '@/types';

export async function GET() {
  try {
    const catalog = getCatalog();

    const rawDatasets: any[] = [];
    const rawTables: any[] = [];
    const rawColumns: any[] = [];

    catalog.datasets.forEach((ds: EnrichedDataset) => {
      rawDatasets.push({
        Dataset_name: ds.name,
        Dataset_description: ds.description,
        Tags: ds.tags,
        SOURCE: ds.source,
        Sensitivity: ds.sensitivity,
      });

      ds.tables.forEach((tbl: EnrichedTable) => {
        rawTables.push({
          TABLE_NAME: tbl.name,
          Dataset_name: ds.name,
          SOURCE: tbl.source,
          LOCATION: tbl.location,
          DATABASE_NAME: tbl.databaseName,
          SCHEMA_NAME: tbl.schemaName,
          OWNER: tbl.owner,
          PRIMARY_KEYS: tbl.primaryKeys,
          FOREIGN_KEYS: tbl.foreignKeys,
          CREATED_DATE: tbl.createdDate,
          UPDATED_DATE: tbl.updatedDate,
          Row_count: tbl.rowCount,
          Description: tbl.description,
          Table_tags: tbl.tags,
          Sensitivity: tbl.sensitivity,
        });

        tbl.columns.forEach((col: EnrichedColumn) => {
          rawColumns.push({
            TABLE_NAME: tbl.name,
            COLUMN_NAME: col.name,
            DATA_TYPE: col.dataType,
            PRIMARY_KEY: col.isPrimaryKey,
            FOREIGN_KEY: col.isForeignKey,
            description: col.description,
            Column_tags: col.tags,
            Sensitivity: col.sensitivity,
          });
        });
      });
    });

    const wb = XLSX.utils.book_new();
    const wsDatasets = XLSX.utils.json_to_sheet(rawDatasets);
    const wsTables = XLSX.utils.json_to_sheet(rawTables);
    const wsColumns = XLSX.utils.json_to_sheet(rawColumns);

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
    console.error('Download Catalog API Error:', error);
    return NextResponse.json({ error: 'Failed to generate Excel file for download' }, { status: 500 });
  }
}
