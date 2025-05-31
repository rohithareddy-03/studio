
// src/app/api/catalog/download/route.ts
import { NextResponse } from 'next/server';
import { getCatalog, loadAndInitializeCatalogFromDisk } from '@/lib/catalog-store'; // Assuming getRawDataForExcel might be added
import * as XLSX from 'xlsx';
import type { EnrichedDataset, EnrichedTable, EnrichedColumn, RawDataset, RawTable, RawColumn } from '@/types';
import fs from 'fs';
import path from 'path';

const CATALOG_XLSX_FILE_PATH = path.join(process.cwd(), 'public', 'csv_data_store', 'catalog.xlsx');

// This function converts the enriched catalog structure back to the raw sheet format
function convertEnrichedToRaw(catalogData: CatalogData): { datasets: RawDataset[], tables: RawTable[], columns: RawColumn[] } {
  const rawDatasets: RawDataset[] = [];
  const rawTables: RawTable[] = [];
  const rawColumns: RawColumn[] = [];

  catalogData.datasets.forEach((ds: EnrichedDataset) => {
    rawDatasets.push({
      Dataset_name: ds.name,
      Dataset_description: ds.description ?? null,
      Tags: ds.tags ?? null,
      source: ds.source ?? null,
      location: ds.location ?? null,
    });

    (ds.tables || []).forEach((tbl: EnrichedTable) => {
      rawTables.push({
        TABLE_NAME: tbl.name,
        Dataset_name: ds.name,
        source: tbl.source ?? null,
        location: tbl.location ?? null,
        DATABASE_NAME: tbl.databaseName ?? null,
        SCHEMA_NAME: tbl.schemaName ?? null,
        OWNER: tbl.owner ?? null,
        PRIMARY_KEYS: tbl.primaryKeys ?? null, // This is a summary string
        FOREIGN_KEYS: tbl.foreignKeys ?? null, // This is a summary string
        CREATED_DATE: tbl.createdDate ?? null,
        UPDATED_DATE: tbl.updatedDate ?? null,
        Row_count: (tbl.rowCount !== undefined && tbl.rowCount !== null) ? String(tbl.rowCount) : null,
        Description: tbl.description ?? null,
        Table_tags: tbl.tags ?? null,
        Sensitivity: tbl.sensitivity ?? null,
      });

      (tbl.columns || []).forEach((col: EnrichedColumn) => {
        rawColumns.push({
          TABLE_NAME: tbl.name,
          COLUMN_NAME: col.name,
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
  return { datasets: rawDatasets, tables: rawTables, columns: rawColumns };
}


export async function GET() {
  try {
    // Ensure the catalog is loaded from disk if not already in memory
    let currentCatalog = getCatalog(); // This attempts to load from memory or disk

    if (!currentCatalog || !currentCatalog.datasets || currentCatalog.datasets.length === 0) {
       // Attempt to load fresh from disk if getCatalog returned empty (e.g. server just started)
       currentCatalog = loadAndInitializeCatalogFromDisk(); 
       if (!currentCatalog || !currentCatalog.datasets || currentCatalog.datasets.length === 0) {
          console.warn('[Download API] Catalog is empty even after attempting disk load. Serving notice file.');
          const wb_empty = XLSX.utils.book_new();
          const ws_notice = XLSX.utils.json_to_sheet([{ Message: "The data catalog is currently empty. Please upload data via the Admin page." }]);
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
    }
    
    console.log(`[Download API] Catalog for download has ${currentCatalog.datasets.length} datasets.`);

    // Convert the (potentially enriched) in-memory catalog back to raw format for Excel
    const { datasets: rawDatasets, tables: rawTables, columns: rawColumns } = convertEnrichedToRaw(currentCatalog);
    
    console.log(`[Download API] Converted to raw. Datasets: ${rawDatasets.length}, Tables: ${rawTables.length}, Columns: ${rawColumns.length}`);

    const wb = XLSX.utils.book_new();
    // Define headers for sheets to ensure correct column order and presence
    const datasetHeaders = ['Dataset_name', 'Dataset_description', 'Tags', 'source', 'location'];
    const tableHeaders = ['TABLE_NAME', 'Dataset_name', 'source', 'location', 'DATABASE_NAME', 'SCHEMA_NAME', 'OWNER', 'PRIMARY_KEYS', 'FOREIGN_KEYS', 'CREATED_DATE', 'UPDATED_DATE', 'Row_count', 'Description', 'Table_tags', 'Sensitivity'];
    const columnHeaders = ['TABLE_NAME', 'COLUMN_NAME', 'DATA_TYPE', 'PRIMARY_KEY', 'FOREIGN_KEY', 'column_description', 'Column_tags', 'Sensitivity', 'location'];

    const wsDatasets = XLSX.utils.json_to_sheet(rawDatasets, { header: datasetHeaders });
    const wsTables = XLSX.utils.json_to_sheet(rawTables, { header: tableHeaders });
    const wsColumns = XLSX.utils.json_to_sheet(rawColumns, { header: columnHeaders });

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
