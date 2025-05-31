
// src/lib/catalog-store.ts
import type { CatalogData, EnrichedDataset, EnrichedTable, EnrichedColumn, RawDataset, RawTable, RawColumn } from '@/types';
import { enrichSingleDataset, type EnrichDatasetInput, type EnrichDatasetOutput } from '@/ai/flows/enrich-dataset-flow';
import { enrichSingleTable, type EnrichTableInput, type EnrichTableOutput } from '@/ai/flows/enrich-table-flow';
import type { ExtractKeysFromSqlOutput } from '@/ai/flows/extract-keys-from-sql-flow';
import { addLog } from './log-store';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

const CSV_DATA_STORE_DIR = path.join(process.cwd(), 'public', 'csv_data_store');
const CATALOG_XLSX_FILE_PATH = path.join(CSV_DATA_STORE_DIR, 'catalog.xlsx');

let catalog: CatalogData | null = null; // In-memory structured catalog
let rawDataForEnrichment: { datasets: RawDataset[], tables: RawTable[], columns: RawColumn[] } | null = null; // In-memory raw data

// Ensures the directory for csv_data_store exists.
function ensureDataStoreDirectoryExists() {
  if (!fs.existsSync(CSV_DATA_STORE_DIR)) {
    fs.mkdirSync(CSV_DATA_STORE_DIR, { recursive: true });
    addLog(`[CatalogStore] Created directory: ${CSV_DATA_STORE_DIR}`);
  }
}

// Helper to read and parse catalog.xlsx
function readCatalogFromExcel(): { datasets: RawDataset[], tables: RawTable[], columns: RawColumn[] } | null {
  ensureDataStoreDirectoryExists();
  if (fs.existsSync(CATALOG_XLSX_FILE_PATH)) {
    addLog(`[CatalogStore] Reading catalog from ${CATALOG_XLSX_FILE_PATH}`);
    try {
      const workbook = XLSX.readFile(CATALOG_XLSX_FILE_PATH);
      addLog(`[CatalogStore] Workbook sheet names: ${JSON.stringify(workbook.SheetNames)}`);

      const rawDatasetsSheet = workbook.Sheets['datasets'];
      const rawTablesSheet = workbook.Sheets['tables'];
      const rawColumnsSheet = workbook.Sheets['columns'];

      if (!rawDatasetsSheet) {
        addLog("[CatalogStore] Excel file is missing 'datasets' sheet. Cannot load.");
        return null;
      }
      addLog("[CatalogStore] 'datasets' sheet found.");

      const datasets = XLSX.utils.sheet_to_json<RawDataset>(rawDatasetsSheet, { defval: null });
      addLog(`[CatalogStore] XLSX.utils.sheet_to_json for 'datasets' returned ${datasets ? datasets.length : 'null/undefined'} items. Preview: ${JSON.stringify(datasets ? datasets.slice(0, 2) : [])}`);

      if (!datasets || datasets.length === 0) {
        addLog("[CatalogStore] Parsed 'datasets' sheet, but it resulted in an empty array or null. Critical data missing. Returning null.");
        return null;
      }

      const tables = rawTablesSheet ? XLSX.utils.sheet_to_json<RawTable>(rawTablesSheet, { defval: null }) : [];
      addLog(`[CatalogStore] Raw tables parsed from sheet (first 2 items): ${JSON.stringify(tables.slice(0, 2))}`);
      
      const columns = rawColumnsSheet ? XLSX.utils.sheet_to_json<RawColumn>(rawColumnsSheet, { defval: null }) : [];
      addLog(`[CatalogStore] Raw columns parsed from sheet (first 2 items): ${JSON.stringify(columns.slice(0, 2))}`);
      
      addLog(`[CatalogStore] Successfully read from Excel. Datasets: ${datasets.length}, Tables: ${tables.length}, Columns: ${columns.length}`);
      return { datasets, tables, columns };
    } catch (e: any) {
      addLog(`[CatalogStore] Error reading or parsing ${CATALOG_XLSX_FILE_PATH}: ${e.message}`);
      console.error(`[CatalogStore] Error reading or parsing ${CATALOG_XLSX_FILE_PATH}:`, e);
      return null;
    }
  }
  addLog(`[CatalogStore] ${CATALOG_XLSX_FILE_PATH} not found. Will start with empty catalog if no upload occurs.`);
  return null;
}

// Helper to save rawDataForEnrichment to catalog.xlsx
async function saveCatalogToExcel(): Promise<void> {
  if (!rawDataForEnrichment) {
    addLog("[CatalogStore] No raw data in memory to save to Excel.");
    return;
  }
  ensureDataStoreDirectoryExists();
  addLog(`[CatalogStore] Attempting to save catalog to ${CATALOG_XLSX_FILE_PATH}`);
  try {
    const wb = XLSX.utils.book_new();
    // Use existing headers from types.ts or define them explicitly for sheet generation
    const datasetHeaders = ['Dataset_name', 'Dataset_description', 'Tags', 'source', 'location'];
    const tableHeaders = ['TABLE_NAME', 'Dataset_name', 'source', 'location', 'DATABASE_NAME', 'SCHEMA_NAME', 'OWNER', 'PRIMARY_KEYS', 'FOREIGN_KEYS', 'CREATED_DATE', 'UPDATED_DATE', 'Row_count', 'Description', 'Table_tags', 'Sensitivity'];
    const columnHeaders = ['TABLE_NAME', 'COLUMN_NAME', 'DATA_TYPE', 'PRIMARY_KEY', 'FOREIGN_KEY', 'column_description', 'Column_tags', 'Sensitivity', 'location'];

    const wsDatasets = XLSX.utils.json_to_sheet(rawDataForEnrichment.datasets, { header: datasetHeaders });
    const wsTables = XLSX.utils.json_to_sheet(rawDataForEnrichment.tables, { header: tableHeaders });
    const wsColumns = XLSX.utils.json_to_sheet(rawDataForEnrichment.columns, { header: columnHeaders });

    XLSX.utils.book_append_sheet(wb, wsDatasets, 'datasets');
    XLSX.utils.book_append_sheet(wb, wsTables, 'tables');
    XLSX.utils.book_append_sheet(wb, wsColumns, 'columns');

    XLSX.writeFile(wb, CATALOG_XLSX_FILE_PATH); // This is synchronous
    addLog(`[CatalogStore] Successfully saved catalog to ${CATALOG_XLSX_FILE_PATH}`);
  } catch (e: any) {
    addLog(`[CatalogStore] Error saving catalog to ${CATALOG_XLSX_FILE_PATH}: ${e.message}`);
    console.error(`[CatalogStore] Error saving catalog to ${CATALOG_XLSX_FILE_PATH}:`, e);
  }
}


// Helper to transform raw data to initial Enriched CatalogData
function transformRawToInitialCatalog(raw: { datasets: RawDataset[], tables: RawTable[], columns: RawColumn[] } | null): CatalogData {
  if (!raw) {
    addLog("[CatalogStore-Transform] Raw data input is null. Returning empty catalog.");
    return { datasets: [] };
  }
  if (!raw.datasets || raw.datasets.length === 0) {
    addLog(`[CatalogStore-Transform] Raw data.datasets is null or empty (length: ${raw.datasets ? raw.datasets.length : 'null/undefined'}). Returning empty catalog.`);
    return { datasets: [] };
  }

  addLog(`[CatalogStore-Transform] Starting transformation of raw data to initial catalog structure. Input raw datasets count: ${raw.datasets.length}`);
  const datasetsMap = new Map<string, EnrichedDataset>();

  raw.datasets.forEach((rd, index) => {
    if (!rd || !rd.Dataset_name) {
      const warningMsg = `[CatalogStore-Transform] Skipping raw dataset at index ${index} due to missing Dataset_name or null dataset object: ${JSON.stringify(rd)}`;
      console.warn(warningMsg);
      addLog(warningMsg);
      return;
    }
    datasetsMap.set(rd.Dataset_name, {
      id: rd.Dataset_name,
      name: rd.Dataset_name,
      description: rd.Dataset_description ?? null,
      tags: rd.Tags ?? null,
      source: rd.source ?? null,
      location: rd.location ?? null,
      sensitivity: 'unknown', 
      tables: [],
    });
  });
  addLog(`[CatalogStore-Transform] Processed ${datasetsMap.size} raw datasets into initial map.`);

  (raw.tables || []).forEach(rt => {
    if (!rt || !rt.Dataset_name || !rt.TABLE_NAME) {
      const warningMsg = `[CatalogStore-Transform] Skipping raw table with missing identifiers: ${JSON.stringify(rt)}`;
      console.warn(warningMsg);
      addLog(warningMsg);
      return;
    }
    const dataset = datasetsMap.get(rt.Dataset_name);
    if (dataset) {
      const tableColumns: EnrichedColumn[] = [];
      const uniqueColumnTracker = new Set<string>();

      (raw.columns || [])
        .filter(rc => rc && rc.TABLE_NAME === rt.TABLE_NAME)
        .forEach(rc => {
          if (!rc.COLUMN_NAME) {
            const colWarningMsg = `[CatalogStore-Transform] Skipping raw column due to missing COLUMN_NAME for table ${rt.TABLE_NAME}: ${JSON.stringify(rc)}`;
            console.warn(colWarningMsg);
            addLog(colWarningMsg);
            return;
          }
          const columnId = `${dataset.name}/${rt.TABLE_NAME}/${rc.COLUMN_NAME}`;
          if (uniqueColumnTracker.has(columnId)) {
            const dupColMsg = `[CatalogStore-Transform] Duplicate raw column ID skipped: ${columnId}`;
            console.warn(dupColMsg);
            addLog(dupColMsg);
            return;
          }
          uniqueColumnTracker.add(columnId);

          tableColumns.push({
            id: columnId,
            name: rc.COLUMN_NAME,
            description: rc.column_description ?? null,
            tags: rc.Column_tags ?? null,
            dataType: rc.DATA_TYPE ?? null,
            isPrimaryKey: String(rc.PRIMARY_KEY).toLowerCase() === 'true',
            isForeignKey: String(rc.FOREIGN_KEY).toLowerCase() === 'true',
            sensitivity: rc.Sensitivity ?? 'unknown', 
            location: rc.location ?? null,
          });
        });
      
      const primaryKeysString = tableColumns.filter(c => c.isPrimaryKey).map(c => c.name).join(', ') || null;
      const foreignKeysString = tableColumns.filter(c => c.isForeignKey).map(c => c.name).join(', ') || null;

      dataset.tables.push({
        id: `${dataset.name}/${rt.TABLE_NAME}`,
        name: rt.TABLE_NAME,
        description: rt.Description ?? null,
        tags: rt.Table_tags ?? null,
        sensitivity: rt.Sensitivity ?? 'unknown', 
        source: rt.source ?? null,
        location: rt.location ?? null,
        databaseName: rt.DATABASE_NAME ?? null,
        schemaName: rt.SCHEMA_NAME ?? null,
        owner: rt.OWNER ?? null,
        primaryKeys: primaryKeysString,
        foreignKeys: foreignKeysString,
        createdDate: rt.CREATED_DATE ?? null,
        updatedDate: rt.UPDATED_DATE ?? null,
        rowCount: rt.Row_count ? parseInt(String(rt.Row_count), 10) : undefined,
        columns: tableColumns,
      });
    } else {
      const tableDsWarn = `[CatalogStore-Transform] Raw table ${rt.TABLE_NAME} refers to non-existent dataset ${rt.Dataset_name}`;
      console.warn(tableDsWarn);
      addLog(tableDsWarn);
    }
  });
  addLog(`[CatalogStore-Transform] Finished processing raw tables and columns.`);
  const finalCatalog = { datasets: Array.from(datasetsMap.values()) };
  addLog(`[CatalogStore-Transform] Transformation complete. Catalog has ${finalCatalog.datasets.length} datasets.`);
  return finalCatalog;
}

// Main function to load catalog from file into memory
export function loadAndInitializeCatalogFromDisk(): CatalogData {
  addLog("[CatalogStore] loadAndInitializeCatalogFromDisk called.");
  const rawDataFromFile = readCatalogFromExcel();
  if (rawDataFromFile) {
    rawDataForEnrichment = JSON.parse(JSON.stringify(rawDataFromFile)); // Deep copy
    catalog = transformRawToInitialCatalog(rawDataFromFile);
    addLog("[CatalogStore] Catalog loaded from Excel and initialized in memory.");
  } else {
    // If file doesn't exist or is invalid, start with empty structures
    rawDataForEnrichment = { datasets: [], tables: [], columns: [] };
    catalog = { datasets: [] };
    addLog("[CatalogStore] No valid Excel file found or error reading it during loadAndInitializeCatalogFromDisk. Initialized empty catalog in memory.");
  }
  // Ensure catalog is never null before stringifying
  return catalog ? JSON.parse(JSON.stringify(catalog)) : { datasets: [] };
}

// Called by API upload route AFTER file is saved to disk.
// Reads the newly saved file, updates in-memory stores.
export async function processUploadedFileAndInitializeCatalog(): Promise<CatalogData> {
  addLog("[CatalogStore] processUploadedFileAndInitializeCatalog: Re-initializing catalog from disk after upload.");
  return loadAndInitializeCatalogFromDisk();
}

// Used by the API after an upload to prime the store.
// Also called when raw data is directly passed (though primary flow is now file-based)
export async function initializeCatalog(rawD: RawDataset[], rawT: RawTable[], rawC: RawColumn[]): Promise<CatalogData> {
  addLog("[CatalogStore] initializeCatalog with provided raw data. Storing raw data and transforming for in-memory catalog.");
  rawDataForEnrichment = { datasets: rawD, tables: rawT, columns: rawC };
  catalog = transformRawToInitialCatalog(rawDataForEnrichment);
  await saveCatalogToExcel(); // Persist this initial state to Excel
  addLog("[CatalogStore] Initial catalog built from raw data and saved to Excel.");
  return catalog ? JSON.parse(JSON.stringify(catalog)) : { datasets: []};
}

export async function enrichSingleDatasetInStore(datasetName: string): Promise<EnrichedDataset | null> {
  addLog(`[CatalogStore] enrichSingleDatasetInStore: Attempting to enrich dataset: ${datasetName}`);
  if (!rawDataForEnrichment) { // Ensure raw data is loaded
    loadAndInitializeCatalogFromDisk();
    if (!rawDataForEnrichment) {
       const noRawMsg = "[CatalogStore] enrichSingleDatasetInStore: No raw data available even after attempting load.";
       console.warn(noRawMsg);
       addLog(noRawMsg);
       return null;
    }
  }
  const rawDataset = rawDataForEnrichment.datasets.find(d => d.Dataset_name === datasetName);
  if (!rawDataset) {
    const notFoundMsg = `[CatalogStore] enrichSingleDatasetInStore: Raw dataset ${datasetName} not found for enrichment.`;
    console.warn(notFoundMsg);
    addLog(notFoundMsg);
    return null;
  }

  const tableNamesInDataset = rawDataForEnrichment.tables
    .filter(t => t.Dataset_name === datasetName)
    .map(t => t.TABLE_NAME);
  addLog(`[CatalogStore] enrichSingleDatasetInStore: Found ${tableNamesInDataset.length} tables for context for dataset ${datasetName}.`);

  try {
    const aiInput: EnrichDatasetInput = {
      datasetToEnrich: { 
        Dataset_name: rawDataset.Dataset_name,
        Dataset_description: rawDataset.Dataset_description,
        Tags: rawDataset.Tags,
        source: rawDataset.source,
        location: rawDataset.location,
      },
      tableNamesInDataset,
    };
    addLog(`[CatalogStore] enrichSingleDatasetInStore: Calling AI for dataset ${datasetName}.`);
    const enrichedOutput: EnrichDatasetOutput = await enrichSingleDataset(aiInput);
    addLog(`[CatalogStore] enrichSingleDatasetInStore: AI enrichment successful for dataset ${datasetName}.`);

    // Update in-memory catalog
    const currentCatalog = catalog ? catalog : {datasets: []}
    const datasetIndexInCatalog = currentCatalog.datasets.findIndex(d => d.name === datasetName);
    if (datasetIndexInCatalog > -1) {
      currentCatalog.datasets[datasetIndexInCatalog].description = enrichedOutput.Dataset_description ?? currentCatalog.datasets[datasetIndexInCatalog].description;
      currentCatalog.datasets[datasetIndexInCatalog].tags = enrichedOutput.Tags ?? currentCatalog.datasets[datasetIndexInCatalog].tags;
      catalog = currentCatalog;
      
      // Update in-memory rawDataForEnrichment
      const rawDatasetIndex = rawDataForEnrichment.datasets.findIndex(d => d.Dataset_name === datasetName);
      if (rawDatasetIndex > -1) {
        rawDataForEnrichment.datasets[rawDatasetIndex].Dataset_description = enrichedOutput.Dataset_description ?? rawDataForEnrichment.datasets[rawDatasetIndex].Dataset_description;
        rawDataForEnrichment.datasets[rawDatasetIndex].Tags = enrichedOutput.Tags ?? rawDataForEnrichment.datasets[rawDatasetIndex].Tags;
      }
      await saveCatalogToExcel(); // Persist changes
      addLog(`[CatalogStore] enrichSingleDatasetInStore: Dataset ${datasetName} updated and saved.`);
      return currentCatalog.datasets[datasetIndexInCatalog];
    }
    addLog(`[CatalogStore] enrichSingleDatasetInStore: Dataset ${datasetName} not found in live catalog after enrichment.`);
    return null;
  } catch (error) {
    const errorMsg = `[CatalogStore] enrichSingleDatasetInStore: Error enriching dataset ${datasetName}: ${error instanceof Error ? error.message : String(error)}`;
    console.error(errorMsg, error);
    addLog(errorMsg);
    return null;
  }
}

export async function enrichSingleTableInStore(datasetName: string, tableName: string): Promise<EnrichedTable | null> {
  addLog(`[CatalogStore] enrichSingleTableInStore: Attempting to enrich table: ${tableName} in dataset: ${datasetName}`);
  if (!rawDataForEnrichment || !catalog) { // Ensure data is loaded
    loadAndInitializeCatalogFromDisk();
     if (!rawDataForEnrichment || !catalog) {
       addLog("[CatalogStore] enrichSingleTableInStore: Raw data or catalog not available after load attempt.");
       return null;
    }
  }
  const rawDataset = rawDataForEnrichment.datasets.find(d => d.Dataset_name === datasetName);
  const rawTable = rawDataForEnrichment.tables.find(t => t.Dataset_name === datasetName && t.TABLE_NAME === tableName);
  const rawColumnsForTable = rawDataForEnrichment.columns.filter(c => c.TABLE_NAME === tableName && rawDataForEnrichment.tables.some(rt => rt.TABLE_NAME === c.TABLE_NAME && rt.Dataset_name === datasetName) );

  if (!rawDataset || !rawTable) {
    addLog(`[CatalogStore] enrichSingleTableInStore: Raw dataset ${datasetName} or table ${tableName} not found.`);
    return null;
  }
  addLog(`[CatalogStore] enrichSingleTableInStore: Found raw data for table ${tableName}. Columns count: ${rawColumnsForTable.length}`);
  
  const otherTableNamesInDataset = rawDataForEnrichment.tables
    .filter(t => t.Dataset_name === datasetName && t.TABLE_NAME !== tableName)
    .map(t => t.TABLE_NAME);
  
  try {
    const aiInput: EnrichTableInput = {
      datasetContext: { Dataset_name: rawDataset.Dataset_name, Dataset_description: rawDataset.Dataset_description ?? "" },
      tableToEnrich: { ...rawTable }, 
      columnsToEnrich: JSON.parse(JSON.stringify(rawColumnsForTable)), 
      otherTableNamesInDataset,
    };
    addLog(`[CatalogStore] enrichSingleTableInStore: Calling AI for table ${tableName}.`);
    const aiOutput: EnrichTableOutput = await enrichSingleTable(aiInput);
    addLog(`[CatalogStore] enrichSingleTableInStore: AI enrichment successful for table ${tableName}.`);

    const currentCatalog = catalog ? catalog : {datasets: []};
    const datasetInCatalog = currentCatalog.datasets.find(d => d.name === datasetName);
    if (!datasetInCatalog) {
      addLog(`[CatalogStore] enrichSingleTableInStore: Dataset ${datasetName} not found in live catalog.`);
      return null;
    }
    const tableIndexInCatalog = datasetInCatalog.tables.findIndex(t => t.name === tableName);
    if (tableIndexInCatalog === -1) {
      addLog(`[CatalogStore] enrichSingleTableInStore: Table ${tableName} not found in catalog dataset ${datasetName}.`);
      return null;
    }

    const enrichedTableFromAI = aiOutput.enrichedTable;
    const enrichedColumnsFromAI = aiOutput.enrichedColumns;
    const currentTableInCatalog = datasetInCatalog.tables[tableIndexInCatalog];
    
    // Update catalog table
    currentTableInCatalog.description = enrichedTableFromAI.Description ?? currentTableInCatalog.description;
    currentTableInCatalog.tags = enrichedTableFromAI.Table_tags ?? currentTableInCatalog.tags;
    currentTableInCatalog.sensitivity = enrichedTableFromAI.Sensitivity ?? currentTableInCatalog.sensitivity ?? 'unknown';
    currentTableInCatalog.source = enrichedTableFromAI.source ?? currentTableInCatalog.source;
    currentTableInCatalog.location = enrichedTableFromAI.location ?? currentTableInCatalog.location;
    currentTableInCatalog.databaseName = enrichedTableFromAI.DATABASE_NAME ?? currentTableInCatalog.databaseName;
    currentTableInCatalog.schemaName = enrichedTableFromAI.SCHEMA_NAME ?? currentTableInCatalog.schemaName;
    currentTableInCatalog.owner = enrichedTableFromAI.OWNER ?? currentTableInCatalog.owner;
    currentTableInCatalog.createdDate = enrichedTableFromAI.CREATED_DATE ?? currentTableInCatalog.createdDate;
    currentTableInCatalog.updatedDate = enrichedTableFromAI.UPDATED_DATE ?? currentTableInCatalog.updatedDate;
    currentTableInCatalog.rowCount = (enrichedTableFromAI.Row_count !== undefined && enrichedTableFromAI.Row_count !== null) 
                                     ? parseInt(String(enrichedTableFromAI.Row_count),10) 
                                     : currentTableInCatalog.rowCount;
    catalog = currentCatalog;

    // Update rawTable data
    const rawTableIndex = rawDataForEnrichment.tables.findIndex(t => t.Dataset_name === datasetName && t.TABLE_NAME === tableName);
    if (rawTableIndex > -1) {
      const targetRawTable = rawDataForEnrichment.tables[rawTableIndex];
      targetRawTable.Description = currentTableInCatalog.description;
      targetRawTable.Table_tags = currentTableInCatalog.tags;
      targetRawTable.Sensitivity = currentTableInCatalog.sensitivity;
      targetRawTable.source = currentTableInCatalog.source;
      targetRawTable.location = currentTableInCatalog.location;
      targetRawTable.DATABASE_NAME = currentTableInCatalog.databaseName;
      targetRawTable.SCHEMA_NAME = currentTableInCatalog.schemaName;
      targetRawTable.OWNER = currentTableInCatalog.owner;
      targetRawTable.CREATED_DATE = currentTableInCatalog.createdDate;
      targetRawTable.UPDATED_DATE = currentTableInCatalog.updatedDate;
      targetRawTable.Row_count = currentTableInCatalog.rowCount !== undefined ? String(currentTableInCatalog.rowCount) : null;
    }
    
    const updatedColumnsForCatalog: EnrichedColumn[] = [];
    for (const originalInputColumn of rawColumnsForTable) { 
      const colAI = enrichedColumnsFromAI.find(c => c.COLUMN_NAME === originalInputColumn.COLUMN_NAME && c.TABLE_NAME === tableName);
      
      const updatedEnrichedCol: EnrichedColumn = {
        id: `${datasetName}/${tableName}/${originalInputColumn.COLUMN_NAME}`,
        name: originalInputColumn.COLUMN_NAME,
        dataType: colAI?.DATA_TYPE ?? originalInputColumn.DATA_TYPE ?? null,
        location: colAI?.location ?? originalInputColumn.location ?? null,
        description: colAI?.column_description ?? originalInputColumn.column_description ?? null,
        tags: colAI?.Column_tags ?? originalInputColumn.Column_tags ?? null,
        sensitivity: colAI?.Sensitivity ?? originalInputColumn.Sensitivity ?? 'unknown',
        isPrimaryKey: colAI ? String(colAI.PRIMARY_KEY).toLowerCase() === 'true' : String(originalInputColumn.PRIMARY_KEY).toLowerCase() === 'true',
        isForeignKey: colAI ? String(colAI.FOREIGN_KEY).toLowerCase() === 'true' : String(originalInputColumn.FOREIGN_KEY).toLowerCase() === 'true',
      };
      updatedColumnsForCatalog.push(updatedEnrichedCol);

      // Update rawColumn data
      const rawColIndex = rawDataForEnrichment.columns.findIndex(c => c.TABLE_NAME === tableName && c.COLUMN_NAME === originalInputColumn.COLUMN_NAME);
      if (rawColIndex > -1) {
        const targetRawCol = rawDataForEnrichment.columns[rawColIndex];
        targetRawCol.column_description = updatedEnrichedCol.description;
        targetRawCol.Column_tags = updatedEnrichedCol.tags;
        targetRawCol.Sensitivity = updatedEnrichedCol.sensitivity;
        targetRawCol.PRIMARY_KEY = updatedEnrichedCol.isPrimaryKey ? 'true' : 'false';
        targetRawCol.FOREIGN_KEY = updatedEnrichedCol.isForeignKey ? 'true' : 'false';
        targetRawCol.DATA_TYPE = updatedEnrichedCol.dataType;
        targetRawCol.location = updatedEnrichedCol.location;
      }
    }
    currentTableInCatalog.columns = updatedColumnsForCatalog;
    currentTableInCatalog.primaryKeys = updatedColumnsForCatalog.filter(c => c.isPrimaryKey).map(c => c.name).join(', ') || null;
    currentTableInCatalog.foreignKeys = updatedColumnsForCatalog.filter(c => c.isForeignKey).map(c => c.name).join(', ') || null;

    await saveCatalogToExcel(); // Persist changes
    addLog(`[CatalogStore] enrichSingleTableInStore: Table ${tableName} updated and saved. Columns processed: ${updatedColumnsForCatalog.length}.`);
    return currentTableInCatalog;

  } catch (error) {
    const errorMsg = `[CatalogStore] enrichSingleTableInStore: Error enriching table ${tableName}: ${error instanceof Error ? error.message : String(error)}`;
    console.error(errorMsg, error);
    addLog(errorMsg);
    return null;
  }
}


export function getCatalog(): CatalogData {
  if (!catalog) {
    addLog("[CatalogStore] In-memory catalog is null, attempting to load from disk for getCatalog.");
    return loadAndInitializeCatalogFromDisk(); // loadAndInitialize will set 'catalog'
  }
  // Fallback to empty if still null (e.g., file not found and no upload yet)
  return catalog ? JSON.parse(JSON.stringify(catalog)) : { datasets: [] };
}

export function getDatasetByName(name: string): EnrichedDataset | undefined {
  const currentCatalog = getCatalog(); 
  return currentCatalog.datasets.find(d => d.name === name);
}

export function getTableByName(datasetName: string, tableName: string): EnrichedTable | undefined {
  const dataset = getDatasetByName(datasetName);
  if (!dataset) return undefined;
  return dataset.tables.find(t => t.name === tableName);
}

export function getTableMetadata(datasetName: string, tableName: string): string | undefined {
  const table = getTableByName(datasetName, tableName);
  if (!table) return undefined;

  let metadata = `Table: ${tableName}\nDescription: ${table.description || 'N/A'}\nSensitivity: ${table.sensitivity || 'N/A'}\nLocation: ${table.location || 'N/A'}\nColumns:\n`;
  (table.columns || []).forEach(col => {
    metadata += `  - ${col.name} (Type: ${col.dataType || 'N/A'}, PK: ${col.isPrimaryKey}, FK: ${col.isForeignKey}, Sensitivity: ${col.sensitivity || 'N/A'}, Description: ${col.description || 'N/A'}, Location: ${col.location || 'N/A'})\n`;
  });
  return metadata;
}

// This function is mainly for the initial upload scenario.
// It receives raw data, sets it as the current rawDataForEnrichment,
// transforms it for the in-memory catalog, and saves it to Excel.
export function storeRawDataForEnrichment(data: { datasets: RawDataset[], tables: RawTable[], columns: RawColumn[] }) {
  rawDataForEnrichment = JSON.parse(JSON.stringify(data));
  catalog = transformRawToInitialCatalog(rawDataForEnrichment); // Update in-memory catalog
  saveCatalogToExcel(); // Persist immediately
  addLog("[CatalogStore] Stored new raw data, updated in-memory catalog, and saved to Excel. Datasets: " + (data.datasets?.length || 0));
}


export async function updateRawDataField(itemId: string, fieldKeyToUpdate: 'description' | 'tags', newValue: string): Promise<boolean> {
  if (!rawDataForEnrichment || !catalog) {
    loadAndInitializeCatalogFromDisk();
     if (!rawDataForEnrichment || !catalog) {
       addLog("[CatalogStore-UpdateRaw] Data not loaded."); return false;
     }
  }
  addLog(`[CatalogStore-UpdateRaw] Request to update item: ${itemId}, field: ${fieldKeyToUpdate}, newValue: ${newValue.substring(0,50)}...`);
  
  const parts = itemId.split('/');
  const datasetName = parts[0];
  const tableName = parts.length > 1 ? parts[1] : undefined;
  const columnName = parts.length > 2 ? parts[2] : undefined;

  let rawDataFieldUpdated = false;
  let catalogFieldUpdated = false;

  // Update rawDataForEnrichment
  if (columnName && tableName) {
    const rawCol = rawDataForEnrichment.columns.find(c => c.TABLE_NAME === tableName && c.COLUMN_NAME === columnName && rawDataForEnrichment.tables.some(t => t.TABLE_NAME === tableName && t.Dataset_name === datasetName));
    if (rawCol) {
      if (fieldKeyToUpdate === 'description') rawCol.column_description = newValue;
      else if (fieldKeyToUpdate === 'tags') rawCol.Column_tags = newValue;
      rawDataFieldUpdated = true;
    }
  } else if (tableName) {
    const rawTable = rawDataForEnrichment.tables.find(t => t.Dataset_name === datasetName && t.TABLE_NAME === tableName);
    if (rawTable) {
      if (fieldKeyToUpdate === 'description') rawTable.Description = newValue;
      else if (fieldKeyToUpdate === 'tags') rawTable.Table_tags = newValue;
      rawDataFieldUpdated = true;
    }
  } else {
    const rawDataset = rawDataForEnrichment.datasets.find(d => d.Dataset_name === datasetName);
    if (rawDataset) {
      if (fieldKeyToUpdate === 'description') rawDataset.Dataset_description = newValue;
      else if (fieldKeyToUpdate === 'tags') rawDataset.Tags = newValue;
      rawDataFieldUpdated = true;
    }
  }

  // Update in-memory catalog
  const currentCatalog = catalog ? catalog : {datasets: []};
  const dsInCatalog = currentCatalog.datasets.find(d => d.name === datasetName);
  if (dsInCatalog) {
    if (columnName && tableName) {
      const tblInCatalog = dsInCatalog.tables.find(t => t.name === tableName);
      if (tblInCatalog) {
        const colInCatalog = tblInCatalog.columns.find(c => c.name === columnName);
        if (colInCatalog) {
          if (fieldKeyToUpdate === 'description') colInCatalog.description = newValue;
          else if (fieldKeyToUpdate === 'tags') colInCatalog.tags = newValue;
          catalogFieldUpdated = true;
        }
      }
    } else if (tableName) {
      const tblInCatalog = dsInCatalog.tables.find(t => t.name === tableName);
      if (tblInCatalog) {
        if (fieldKeyToUpdate === 'description') tblInCatalog.description = newValue;
        else if (fieldKeyToUpdate === 'tags') tblInCatalog.tags = newValue;
        catalogFieldUpdated = true;
      }
    } else {
      if (fieldKeyToUpdate === 'description') dsInCatalog.description = newValue;
      else if (fieldKeyToUpdate === 'tags') dsInCatalog.tags = newValue;
      catalogFieldUpdated = true;
    }
  }
  catalog = currentCatalog;


  if (rawDataFieldUpdated && catalogFieldUpdated) {
    await saveCatalogToExcel();
    addLog(`[CatalogStore-UpdateRaw] Field '${fieldKeyToUpdate}' for item '${itemId}' updated and saved.`);
    return true;
  } else {
    addLog(`[CatalogStore-UpdateRaw] Failed to update field '${fieldKeyToUpdate}' for item '${itemId}'. Raw update: ${rawDataFieldUpdated}, Catalog update: ${catalogFieldUpdated}`);
    return false;
  }
}


export async function updateKeysFromSqlAnalysis(datasetName: string, targetTableName: string | undefined, keyInfo: ExtractKeysFromSqlOutput): Promise<boolean> {
  if (!rawDataForEnrichment || !catalog) {
    loadAndInitializeCatalogFromDisk();
    if (!rawDataForEnrichment || !catalog) {
      addLog("[CatalogStore-UpdateKeysSQL] Data not loaded."); return false;
    }
  }
  addLog(`[CatalogStore-UpdateKeysSQL] Starting update for dataset: ${datasetName}, table: ${targetTableName || 'all relevant'}.`);
  
  let changesMade = false;
  const currentCatalog = catalog ? catalog : {datasets: []};
  const datasetInCatalog = currentCatalog.datasets.find(d => d.name === datasetName);
  if (!datasetInCatalog) {
    addLog(`[CatalogStore-UpdateKeysSQL] Dataset ${datasetName} not found in live catalog.`);
    return false;
  }

  const tablesToResetKeys = targetTableName 
    ? [targetTableName] 
    : Array.from(new Set([...keyInfo.primaryKeys.map(k => k.tableName), ...keyInfo.foreignKeys.map(k => k.tableName)]));
  addLog(`[CatalogStore-UpdateKeysSQL] Tables to reset/update keys for: ${tablesToResetKeys.join(', ')}`);

  // Reset relevant keys in rawData
  tablesToResetKeys.forEach(tableNameFromAI => {
    rawDataForEnrichment!.columns.forEach(rawCol => {
      if (rawCol.TABLE_NAME === tableNameFromAI && rawDataForEnrichment!.tables.some(t => t.TABLE_NAME === tableNameFromAI && t.Dataset_name === datasetName)) {
        if (rawCol.PRIMARY_KEY === 'true') { rawCol.PRIMARY_KEY = 'false'; changesMade = true; }
        if (rawCol.FOREIGN_KEY === 'true') { rawCol.FOREIGN_KEY = 'false'; changesMade = true; }
      }
    });
  });

  // Apply new PKs from AI
  keyInfo.primaryKeys.forEach(pk => {
    if (targetTableName && pk.tableName !== targetTableName) return; 
    const rawCol = rawDataForEnrichment!.columns.find(c => c.TABLE_NAME === pk.tableName && c.COLUMN_NAME === pk.columnName && rawDataForEnrichment!.tables.some(t => t.TABLE_NAME === pk.tableName && t.Dataset_name === datasetName));
    if (rawCol && rawCol.PRIMARY_KEY !== 'true') {
      rawCol.PRIMARY_KEY = 'true';
      changesMade = true;
      addLog(`[CatalogStore-UpdateKeysSQL] Raw PK updated: ${pk.tableName}.${pk.columnName}`);
    }
  });

  // Apply new FKs from AI
  keyInfo.foreignKeys.forEach(fk => {
    if (targetTableName && fk.tableName !== targetTableName) return;
    const rawCol = rawDataForEnrichment!.columns.find(c => c.TABLE_NAME === fk.tableName && c.COLUMN_NAME === fk.columnName && rawDataForEnrichment!.tables.some(t => t.TABLE_NAME === fk.tableName && t.Dataset_name === datasetName));
    if (rawCol && rawCol.FOREIGN_KEY !== 'true') {
      rawCol.FOREIGN_KEY = 'true';
      changesMade = true;
      addLog(`[CatalogStore-UpdateKeysSQL] Raw FK updated: ${fk.tableName}.${fk.columnName}`);
    }
  });

  // Rebuild in-memory catalog from updated rawData
  if (changesMade) {
    catalog = transformRawToInitialCatalog(rawDataForEnrichment);
    await saveCatalogToExcel();
    addLog(`[CatalogStore-UpdateKeysSQL] Successfully updated key information and saved to Excel.`);
  } else {
    addLog(`[CatalogStore-UpdateKeysSQL] No changes made to key information based on AI analysis.`);
  }
  return changesMade;
}

// Call on server startup to load initial catalog if file exists
if (typeof process !== 'undefined' && (!process.env.NODE_ENV || process.env.NODE_ENV !== 'test')) {
    loadAndInitializeCatalogFromDisk();
    addLog("[CatalogStore] Initial load attempt from disk complete on store module load.");
}

