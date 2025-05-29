
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
        source: ds.source, // Updated to lowercase 'source'
        location: ds.location, // Added location
        // Sensitivity for dataset is not explicitly stored/enriched in this model,
        // but if it were, it would be: Sensitivity: ds.sensitivity,
      });

      ds.tables.forEach((tbl: EnrichedTable) => {
        rawTables.push({
          TABLE_NAME: tbl.name,
          Dataset_name: ds.name,
          source: tbl.source, // Updated to lowercase 'source'
          location: tbl.location, // Added location
          DATABASE_NAME: tbl.databaseName,
          SCHEMA_NAME: tbl.schemaName,
          OWNER: tbl.owner,
          PRIMARY_KEYS: tbl.primaryKeys,
          FOREIGN_KEYS: tbl.foreignKeys,
          CREATED_DATE: tbl.createdDate,
          UPDATED_DATE: tbl.updatedDate,
          Row_count: tbl.rowCount,
          Description: tbl.description, // Standardized field name
          Table_tags: tbl.tags, // Standardized field name
          Sensitivity: tbl.sensitivity,
        });

        tbl.columns.forEach((col: EnrichedColumn) => {
          rawColumns.push({
            TABLE_NAME: tbl.name,
            COLUMN_NAME: col.name,
            DATA_TYPE: col.dataType,
            PRIMARY_KEY: col.isPrimaryKey ? 'true' : 'false',
            FOREIGN_KEY: col.isForeignKey ? 'true' : 'false',
            column_description: col.description, // Updated to 'column_description'
            Column_tags: col.tags, // Standardized field name
            Sensitivity: col.sensitivity,
            location: col.location, // Added location
          });
        });
      });
    });

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
    console.error('Download Catalog API Error:', error);
    return NextResponse.json({ error: 'Failed to generate Excel file for download' }, { status: 500 });
  }
}

