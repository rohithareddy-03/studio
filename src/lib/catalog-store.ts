
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

const ALL_DATASET_KEYS: (keyof RawDataset)[] = ['Dataset_name', 'Dataset_description', 'Tags', 'source', 'location'];
const ALL_TABLE_KEYS: (keyof RawTable)[] = ['TABLE_NAME', 'Dataset_name', 'source', 'location', 'DATABASE_NAME', 'SCHEMA_NAME', 'OWNER', 'PRIMARY_KEYS', 'FOREIGN_KEYS', 'CREATED_DATE', 'UPDATED_DATE', 'Row_count', 'Description', 'Table_tags', 'Sensitivity'];
const ALL_COLUMN_KEYS: (keyof RawColumn)[] = ['TABLE_NAME', 'COLUMN_NAME', 'DATA_TYPE', 'PRIMARY_KEY', 'FOREIGN_KEY', 'column_description', 'Column_tags', 'Sensitivity', 'location'];


function transformToCanonical<T extends object>(
  parsedData: any[],
  allCanonicalKeys: ReadonlyArray<keyof T>, // Use ReadonlyArray for safety
  entityNameForLog: string // For more specific logging
): T[] {
  addLog(`[TransformToCanonical ENTRY for ${entityNameForLog}] Processing ${parsedData.length} items. First raw item (sample): ${JSON.stringify(parsedData[0]).substring(0, 200)}`);

  const result = parsedData.map((obj, objIndex) => {
    const newObj: { [key: string]: any } = {}; // Build with string keys
    const excelKeys = Object.keys(obj); // Keys from the Excel sheet for this row

    // if (objIndex === 0) { // Log details only for the first object of this type for brevity
    //   addLog(`[TransformToCanonical MAP ${objIndex} for ${entityNameForLog}] Input obj: ${JSON.stringify(obj).substring(0,200)}. Excel keys: ${JSON.stringify(excelKeys)}`);
    // }

    for (const canonicalKey of allCanonicalKeys) {
      const canonicalKeyStr = String(canonicalKey); // e.g., "Dataset_name"

      // Find the key in excelKeys that matches canonicalKeyStr case-insensitively
      const excelKeyFound = excelKeys.find(
        (ek) => ek.trim().toLowerCase() === canonicalKeyStr.trim().toLowerCase()
      );

      // if (objIndex === 0) {
      //    addLog(`[TransformToCanonical MAP ${objIndex} for ${entityNameForLog}] Trying canonicalKey: '${canonicalKeyStr}'. Found excelKey: '${excelKeyFound}'.`);
      // }

      if (excelKeyFound && obj[excelKeyFound] !== undefined && obj[excelKeyFound] !== null) {
        newObj[canonicalKeyStr] = obj[excelKeyFound];
        // if (objIndex === 0) {
        //   addLog(`[TransformToCanonical MAP ${objIndex} for ${entityNameForLog}] -> Set newObj['${canonicalKeyStr}'] = '${String(obj[excelKeyFound]).substring(0,50)}'`);
        // }
      } else {
        newObj[canonicalKeyStr] = null; // Ensure all canonical keys exist, even if null
        // if (objIndex === 0) {
        //    addLog(`[TransformToCanonical MAP ${objIndex} for ${entityNameForLog}] -> Set newObj['${canonicalKeyStr}'] = null (excelKeyFound: ${excelKeyFound})`);
        // }
      }
    }
    if (objIndex === 0) {
        addLog(`[TransformToCanonical MAP ${objIndex} for ${entityNameForLog}] Created newObj keys: ${JSON.stringify(Object.keys(newObj))}. Sample newObj: ${JSON.stringify(newObj).substring(0,200)}`);
    }
    return newObj as T;
  });
  if (result.length > 0) {
    addLog(`[TransformToCanonical EXIT for ${entityNameForLog}] Processed ${result.length} items. First transformed item (sample): ${JSON.stringify(result[0]).substring(0, 200)}`);
  } else {
    addLog(`[TransformToCanonical EXIT for ${entityNameForLog}] Processed 0 items or input was empty.`);
  }
  return result;
}


// Helper to parse a workbook object into raw data
function parseWorkbookToRawData(workbook: XLSX.WorkBook): { datasets: RawDataset[], tables: RawTable[], columns: RawColumn[] } | null {
  addLog(`[CatalogStore-ParseWorkbook] Parsing workbook. Sheet names: ${JSON.stringify(workbook.SheetNames)}`);

  const rawDatasetsSheet = workbook.Sheets['datasets'];
  const rawTablesSheet = workbook.Sheets['tables'];
  const rawColumnsSheet = workbook.Sheets['columns'];

  if (!rawDatasetsSheet) {
    addLog("[CatalogStore-ParseWorkbook] Excel workbook is missing 'datasets' sheet. Cannot load.");
    return null;
  }
  addLog("[CatalogStore-ParseWorkbook] 'datasets' sheet found.");

  const parsedDatasets = XLSX.utils.sheet_to_json<any>(rawDatasetsSheet, { defval: null });
  addLog(`[CatalogStore-ParseWorkbook] XLSX.utils.sheet_to_json for 'datasets' returned ${parsedDatasets ? parsedDatasets.length : 'null/undefined'} items. Preview (raw from xlsx): ${JSON.stringify(parsedDatasets ? parsedDatasets.slice(0, 2) : [])}`);
  
  const datasets = transformToCanonical<RawDataset>(parsedDatasets, ALL_DATASET_KEYS, 'Datasets');


  if (!datasets || datasets.length === 0) {
    addLog("[CatalogStore-ParseWorkbook] Parsed 'datasets' sheet, but it resulted in an empty array or null after canonical transformation. Critical data missing. Returning null.");
    return null;
  }

  const parsedTables = rawTablesSheet ? XLSX.utils.sheet_to_json<any>(rawTablesSheet, { defval: null }) : [];
  addLog(`[CatalogStore-ParseWorkbook] Raw tables parsed from sheet (count: ${parsedTables.length}, first 2 items): ${JSON.stringify(parsedTables.slice(0, 2))}`);
  const tables = transformToCanonical<RawTable>(parsedTables, ALL_TABLE_KEYS, 'Tables');
  
  const parsedColumns = rawColumnsSheet ? XLSX.utils.sheet_to_json<any>(rawColumnsSheet, { defval: null }) : [];
  addLog(`[CatalogStore-ParseWorkbook] Raw columns parsed from sheet (count: ${parsedColumns.length}, first 2 items): ${JSON.stringify(parsedColumns.slice(0, 2))}`);
  const columns = transformToCanonical<RawColumn>(parsedColumns, ALL_COLUMN_KEYS, 'Columns');
  
  addLog(`[CatalogStore-ParseWorkbook] Successfully parsed and canonicalized workbook. Datasets: ${datasets.length}, Tables: ${tables.length}, Columns: ${columns.length}`);
  return { datasets, tables, columns };
}


// Helper to read and parse catalog.xlsx from disk
function readCatalogFromExcelFile(): { datasets: RawDataset[], tables: RawTable[], columns: RawColumn[] } | null {
  ensureDataStoreDirectoryExists();
  if (fs.existsSync(CATALOG_XLSX_FILE_PATH)) {
    addLog(`[CatalogStore] Reading catalog from ${CATALOG_XLSX_FILE_PATH}`);
    try {
      const workbook = XLSX.readFile(CATALOG_XLSX_FILE_PATH);
      return parseWorkbookToRawData(workbook);
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
    
    // Use canonical keys for headers to ensure consistency
    const datasetHeaders = ALL_DATASET_KEYS as string[];
    const tableHeaders = ALL_TABLE_KEYS as string[];
    const columnHeaders = ALL_COLUMN_KEYS as string[];

    const wsDatasets = XLSX.utils.json_to_sheet(rawDataForEnrichment.datasets, { header: datasetHeaders });
    const wsTables = XLSX.utils.json_to_sheet(rawDataForEnrichment.tables, { header: tableHeaders });
    const wsColumns = XLSX.utils.json_to_sheet(rawDataForEnrichment.columns, { header: columnHeaders });

    XLSX.utils.book_append_sheet(wb, wsDatasets, 'datasets');
    XLSX.utils.book_append_sheet(wb, wsTables, 'tables');
    XLSX.utils.book_append_sheet(wb, wsColumns, 'columns');

    XLSX.writeFile(wb, CATALOG_XLSX_FILE_PATH);
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

  addLog(`[CatalogStore-Transform] Starting transformation. Input raw datasets: ${raw.datasets.length}, raw tables: ${(raw.tables || []).length}, raw columns: ${(raw.columns || []).length}`);
  const datasetsMap = new Map<string, EnrichedDataset>();

  raw.datasets.forEach((rd, index) => {
    if (!rd || !rd.Dataset_name) { // This check expects lowercase 'n' due to transformToCanonical
      const warningMsg = `[CatalogStore-Transform] Skipping raw dataset at index ${index} due to missing Dataset_name (expected lowercase 'n') or null dataset object: ${JSON.stringify(rd).substring(0,150)}`;
      console.warn(warningMsg);
      addLog(warningMsg);
      return;
    }
    datasetsMap.set(rd.Dataset_name, { // Uses lowercase 'n'
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

  (raw.tables || []).forEach(rt => { // rt should have canonical keys (Dataset_name with lowercase 'n')
    if (!rt || !rt.Dataset_name || !rt.TABLE_NAME) { // Expects lowercase 'n'
      const warningMsg = `[CatalogStore-Transform] Skipping raw table with missing identifiers (expected lowercase 'Dataset_name'): ${JSON.stringify(rt).substring(0,150)}`;
      console.warn(warningMsg);
      addLog(warningMsg);
      return;
    }
    const dataset = datasetsMap.get(rt.Dataset_name); // Uses lowercase 'n'
    if (dataset) {
      addLog(`[CatalogStore-Transform] Processing table '${rt.TABLE_NAME}' for dataset '${rt.Dataset_name}'.`);
      const tableColumns: EnrichedColumn[] = [];
      const uniqueColumnTracker = new Set<string>();
      let columnsFoundForThisTable = 0;

      (raw.columns || []) // rc should have canonical keys
        .filter(rc => rc && rc.TABLE_NAME === rt.TABLE_NAME) 
        .forEach(rc => {
          columnsFoundForThisTable++;
          if (!rc.COLUMN_NAME) { // Canonical key
            const colWarningMsg = `[CatalogStore-Transform] Skipping raw column due to missing COLUMN_NAME for table ${rt.TABLE_NAME}: ${JSON.stringify(rc).substring(0,100)}`;
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
            name: rc.COLUMN_NAME, // Canonical
            description: rc.column_description ?? null, // Canonical
            tags: rc.Column_tags ?? null, // Canonical
            dataType: rc.DATA_TYPE ?? null, // Canonical
            isPrimaryKey: String(rc.PRIMARY_KEY).toLowerCase() === 'true', // Canonical
            isForeignKey: String(rc.FOREIGN_KEY).toLowerCase() === 'true', // Canonical
            sensitivity: rc.Sensitivity ?? 'unknown',  // Canonical
            location: rc.location ?? null, // Canonical
          });
        });
      addLog(`[CatalogStore-Transform] Table '${rt.TABLE_NAME}': Found ${columnsFoundForThisTable} potential raw columns, added ${tableColumns.length} enriched columns.`);
      
      const primaryKeysString = tableColumns.filter(c => c.isPrimaryKey).map(c => c.name).join(', ') || null;
      const foreignKeysString = tableColumns.filter(c => c.isForeignKey).map(c => c.name).join(', ') || null;

      dataset.tables.push({
        id: `${dataset.name}/${rt.TABLE_NAME}`,
        name: rt.TABLE_NAME, // Canonical
        description: rt.Description ?? null, // Canonical
        tags: rt.Table_tags ?? null, // Canonical
        sensitivity: rt.Sensitivity ?? 'unknown',  // Canonical
        source: rt.source ?? null, // Canonical
        location: rt.location ?? null, // Canonical
        databaseName: rt.DATABASE_NAME ?? null, // Canonical
        schemaName: rt.SCHEMA_NAME ?? null, // Canonical
        owner: rt.OWNER ?? null, // Canonical
        primaryKeys: primaryKeysString,
        foreignKeys: foreignKeysString,
        createdDate: rt.CREATED_DATE ?? null, // Canonical
        updatedDate: rt.UPDATED_DATE ?? null, // Canonical
        rowCount: rt.Row_count ? parseInt(String(rt.Row_count), 10) : undefined, // Canonical
        columns: tableColumns,
      });
    } else {
      const tableDsWarn = `[CatalogStore-Transform] Raw table '${rt.TABLE_NAME}' (Dataset_name: '${rt.Dataset_name}') references a dataset not found in datasetsMap. Dataset_name in table may not match a name in the datasets sheet or was skipped. Skipping this table.`;
      console.warn(tableDsWarn);
      addLog(tableDsWarn);
    }
  });
  addLog(`[CatalogStore-Transform] Finished processing raw tables and columns.`);
  
  datasetsMap.forEach(ds => {
    addLog(`[CatalogStore-Transform-Summary] Dataset: ${ds.name}, Tables: ${ds.tables.length}`);
    if (ds.tables.length > 0) {
        addLog(`[CatalogStore-Transform-Summary] First table in ${ds.name}: ${ds.tables[0].name}, Columns: ${ds.tables[0].columns.length}`);
    }
  });

  const finalCatalog = { datasets: Array.from(datasetsMap.values()) };
  addLog(`[CatalogStore-Transform] Transformation complete. Final catalog has ${finalCatalog.datasets.length} datasets.`);
  return finalCatalog;
}

// Main function to load catalog from disk file into memory
export function loadAndInitializeCatalogFromDisk(): CatalogData {
  addLog("[CatalogStore] loadAndInitializeCatalogFromDisk called.");
  const rawDataFromFile = readCatalogFromExcelFile();
  if (rawDataFromFile) {
    rawDataForEnrichment = JSON.parse(JSON.stringify(rawDataFromFile)); // Deep copy
    catalog = transformRawToInitialCatalog(rawDataFromFile);
    addLog("[CatalogStore] Catalog loaded from Excel and initialized in memory.");
  } else {
    rawDataForEnrichment = { datasets: [], tables: [], columns: [] };
    catalog = { datasets: [] };
    addLog("[CatalogStore] No valid Excel file found or error reading it during loadAndInitializeCatalogFromDisk. Initialized empty catalog in memory.");
  }
  return catalog ? JSON.parse(JSON.stringify(catalog)) : { datasets: [] };
}

// New function to process catalog from an in-memory buffer
export function processAndInitializeCatalogFromBuffer(fileBuffer: ArrayBuffer): CatalogData {
  addLog("[CatalogStore] processAndInitializeCatalogFromBuffer called.");
  try {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const parsedRawData = parseWorkbookToRawData(workbook);

    if (parsedRawData) {
        rawDataForEnrichment = JSON.parse(JSON.stringify(parsedRawData)); 
        catalog = transformRawToInitialCatalog(parsedRawData); 
        addLog("[CatalogStore-Buffer] Catalog initialized in memory from buffer.");
    } else {
        rawDataForEnrichment = { datasets: [], tables: [], columns: [] };
        catalog = { datasets: [] };
        addLog("[CatalogStore-Buffer] Error parsing workbook from buffer or 'datasets' sheet missing/empty. Initialized empty catalog.");
    }
    return catalog ? JSON.parse(JSON.stringify(catalog)) : { datasets: [] };
  } catch (e: any) {
    addLog(`[CatalogStore-Buffer] Error processing Excel buffer: ${e.message}`);
    console.error(`[CatalogStore-Buffer] Error processing Excel buffer:`, e);
    rawDataForEnrichment = { datasets: [], tables: [], columns: [] };
    catalog = { datasets: [] };
    return catalog;
  }
}


// DEPRECATED in favor of processAndInitializeCatalogFromBuffer for direct upload processing.
export async function processUploadedFileAndInitializeCatalog(): Promise<CatalogData> {
  addLog("[CatalogStore] processUploadedFileAndInitializeCatalog (disk-based) called. Using buffer-based processing for uploads via processAndInitializeCatalogFromBuffer.");
  return loadAndInitializeCatalogFromDisk(); // Still might be called by other logic, ensure it works
}

// Also called when raw data is directly passed (though primary flow is now file-based)
export async function initializeCatalog(rawD: RawDataset[], rawT: RawTable[], rawC: RawColumn[]): Promise<CatalogData> {
  addLog("[CatalogStore] initializeCatalog with provided raw data. Storing raw data and transforming for in-memory catalog.");
  // Ensure the provided raw data uses canonical keys before storing
  const datasets = transformToCanonical<RawDataset>(rawD, ALL_DATASET_KEYS, 'ExternalDatasets');
  const tables = transformToCanonical<RawTable>(rawT, ALL_TABLE_KEYS, 'ExternalTables');
  const columns = transformToCanonical<RawColumn>(rawC, ALL_COLUMN_KEYS, 'ExternalColumns');

  rawDataForEnrichment = { datasets, tables, columns };
  catalog = transformRawToInitialCatalog(rawDataForEnrichment);
  await saveCatalogToExcel(); // Persist this initial state to Excel
  addLog("[CatalogStore] Initial catalog built from raw data and saved to Excel.");
  return catalog ? JSON.parse(JSON.stringify(catalog)) : { datasets: []};
}

export async function enrichSingleDatasetInStore(datasetName: string): Promise<EnrichedDataset | null> {
  addLog(`[CatalogStore] enrichSingleDatasetInStore: Attempting to enrich dataset: ${datasetName}`);
  if (!rawDataForEnrichment) { 
    loadAndInitializeCatalogFromDisk();
    if (!rawDataForEnrichment) {
       const noRawMsg = "[CatalogStore] enrichSingleDatasetInStore: No raw data available even after attempting load.";
       console.warn(noRawMsg);
       addLog(noRawMsg);
       return null;
    }
  }
  // Expect canonical 'Dataset_name' in rawDataForEnrichment.datasets
  const rawDataset = rawDataForEnrichment.datasets.find(d => d.Dataset_name === datasetName);
  if (!rawDataset) {
    const notFoundMsg = `[CatalogStore] enrichSingleDatasetInStore: Raw dataset ${datasetName} not found for enrichment (checked with canonical key 'Dataset_name').`;
    console.warn(notFoundMsg);
    addLog(notFoundMsg);
    return null;
  }

  // Expect canonical keys in rawDataForEnrichment.tables
  const tableNamesInDataset = rawDataForEnrichment.tables
    .filter(t => t.Dataset_name === datasetName)
    .map(t => t.TABLE_NAME);
  addLog(`[CatalogStore] enrichSingleDatasetInStore: Found ${tableNamesInDataset.length} tables for context for dataset ${datasetName}.`);

  try {
    // Pass data to AI flow using canonical keys
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
    addLog(`[CatalogStore] enrichSingleDatasetInStore: AI enrichment successful for dataset ${datasetName}. Output Description: ${enrichedOutput.Dataset_description?.substring(0,50)}, Tags: ${enrichedOutput.Tags}`);

    const currentCatalog = catalog ? catalog : {datasets: []}
    // Dataset name in catalog is canonical
    const datasetIndexInCatalog = currentCatalog.datasets.findIndex(d => d.name === datasetName); 
    if (datasetIndexInCatalog > -1) {
      currentCatalog.datasets[datasetIndexInCatalog].description = enrichedOutput.Dataset_description ?? currentCatalog.datasets[datasetIndexInCatalog].description;
      currentCatalog.datasets[datasetIndexInCatalog].tags = enrichedOutput.Tags ?? currentCatalog.datasets[datasetIndexInCatalog].tags;
      catalog = currentCatalog;
      
      // Update rawDataForEnrichment using canonical keys
      const rawDatasetIndex = rawDataForEnrichment.datasets.findIndex(d => d.Dataset_name === datasetName);
      if (rawDatasetIndex > -1) {
        rawDataForEnrichment.datasets[rawDatasetIndex].Dataset_description = enrichedOutput.Dataset_description ?? rawDataForEnrichment.datasets[rawDatasetIndex].Dataset_description;
        rawDataForEnrichment.datasets[rawDatasetIndex].Tags = enrichedOutput.Tags ?? rawDataForEnrichment.datasets[rawDatasetIndex].Tags;
      }
      await saveCatalogToExcel(); 
      addLog(`[CatalogStore] enrichSingleDatasetInStore: Dataset ${datasetName} updated in catalog and raw data, then saved.`);
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
  if (!rawDataForEnrichment || !catalog) { 
    loadAndInitializeCatalogFromDisk();
     if (!rawDataForEnrichment || !catalog) {
       addLog("[CatalogStore] enrichSingleTableInStore: Raw data or catalog not available after load attempt.");
       return null;
    }
  }
  // Use canonical keys for lookup
  const rawDataset = rawDataForEnrichment.datasets.find(d => d.Dataset_name === datasetName);
  const rawTable = rawDataForEnrichment.tables.find(t => t.Dataset_name === datasetName && t.TABLE_NAME === tableName);
  const rawColumnsForTable = rawDataForEnrichment.columns.filter(c => 
    c.TABLE_NAME === tableName && 
    rawDataForEnrichment.tables.some(rt => rt.TABLE_NAME === c.TABLE_NAME && rt.Dataset_name === datasetName)
  );


  if (!rawDataset || !rawTable) {
    addLog(`[CatalogStore] enrichSingleTableInStore: Raw dataset ${datasetName} or table ${tableName} not found (using canonical keys).`);
    return null;
  }
  addLog(`[CatalogStore] enrichSingleTableInStore: Found raw data for table ${tableName}. Columns count: ${rawColumnsForTable.length}`);
  
  const otherTableNamesInDataset = rawDataForEnrichment.tables
    .filter(t => t.Dataset_name === datasetName && t.TABLE_NAME !== tableName)
    .map(t => t.TABLE_NAME);
  
  try {
    const aiInput: EnrichTableInput = {
      datasetContext: { Dataset_name: rawDataset.Dataset_name, Dataset_description: rawDataset.Dataset_description ?? "" },
      tableToEnrich: { ...rawTable }, // rawTable should have canonical keys
      columnsToEnrich: JSON.parse(JSON.stringify(rawColumnsForTable)), // rawColumnsForTable should have canonical keys
      otherTableNamesInDataset,
    };
    addLog(`[CatalogStore] enrichSingleTableInStore: Calling AI for table ${tableName}.`);
    const aiOutput: EnrichTableOutput = await enrichSingleTable(aiInput);
    addLog(`[CatalogStore] enrichSingleTableInStore: AI enrichment successful for table ${tableName}.`);

    const currentCatalog = catalog ? catalog : {datasets: []};
    const datasetInCatalog = currentCatalog.datasets.find(d => d.name === datasetName); // catalog uses canonical name
    if (!datasetInCatalog) {
      addLog(`[CatalogStore] enrichSingleTableInStore: Dataset ${datasetName} not found in live catalog.`);
      return null;
    }
    const tableIndexInCatalog = datasetInCatalog.tables.findIndex(t => t.name === tableName); // catalog uses canonical name
    if (tableIndexInCatalog === -1) {
      addLog(`[CatalogStore] enrichSingleTableInStore: Table ${tableName} not found in catalog dataset ${datasetName}.`);
      return null;
    }

    const enrichedTableFromAI = aiOutput.enrichedTable; // Should also have canonical keys from AI flow's strict output
    const enrichedColumnsFromAI = aiOutput.enrichedColumns; // Same here

    // Update catalog (all keys here are canonical)
    const currentTableInCatalog = datasetInCatalog.tables[tableIndexInCatalog];
    currentTableInCatalog.description = enrichedTableFromAI.Description ?? currentTableInCatalog.description;
    currentTableInCatalog.tags = enrichedTableFromAI.Table_tags ?? currentTableInCatalog.tags;
    currentTableInCatalog.sensitivity = enrichedTableFromAI.Sensitivity ?? currentTableInCatalog.sensitivity ?? 'unknown';
    
    // Update rawDataForEnrichment (all keys here are canonical)
    const rawTableIndex = rawDataForEnrichment.tables.findIndex(t => t.Dataset_name === datasetName && t.TABLE_NAME === tableName);
    if (rawTableIndex > -1) {
      const targetRawTable = rawDataForEnrichment.tables[rawTableIndex];
      targetRawTable.Description = currentTableInCatalog.description;
      targetRawTable.Table_tags = currentTableInCatalog.tags;
      targetRawTable.Sensitivity = currentTableInCatalog.sensitivity;
    }
    
    // Update columns based on AI output
 for (const rawCol of rawColumnsForTable) { // Iterate over original raw columns for the table
      const aiEnrichedCol = enrichedColumnsFromAI.find(c => c.COLUMN_NAME === rawCol.COLUMN_NAME && c.TABLE_NAME === rawCol.TABLE_NAME);

      // Find the corresponding column in the catalog and update it
      const catalogCol = currentTableInCatalog.columns.find(c => c.name === rawCol.COLUMN_NAME);
      if (catalogCol && aiEnrichedCol) {
        catalogCol.description = aiEnrichedCol.column_description ?? catalogCol.description;
        catalogCol.tags = aiEnrichedCol.Column_tags ?? catalogCol.tags;
        catalogCol.sensitivity = aiEnrichedCol.Sensitivity ?? catalogCol.sensitivity ?? 'unknown';
      }

      // Find the corresponding column in rawDataForEnrichment and update it
      const rawDataCol = rawDataForEnrichment.columns.find(c => c.TABLE_NAME === rawCol.TABLE_NAME && c.COLUMN_NAME === rawCol.COLUMN_NAME);
      if (rawDataCol && aiEnrichedCol) {
        rawDataCol.column_description = aiEnrichedCol.column_description ?? rawDataCol.column_description;
        rawDataCol.Column_tags = aiEnrichedCol.Column_tags ?? rawDataCol.Column_tags;
        rawDataCol.Sensitivity = aiEnrichedCol.Sensitivity ?? rawDataCol.Sensitivity;
       }
    }
    catalog = currentCatalog; // Assign back the modified catalog
    await saveCatalogToExcel(); 
    addLog(`[CatalogStore] enrichSingleTableInStore: Table ${tableName} updated in catalog and rawData, then saved. Columns processed: ${rawColumnsForTable.length}.`);
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
    return loadAndInitializeCatalogFromDisk(); 
  }
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

//This function is mostly for the initial upload via API, where raw data comes from Excel.
export function storeRawDataForEnrichment(data: { datasets: RawDataset[], tables: RawTable[], columns: RawColumn[] }) {
  // The data here is already expected to be canonicalized by parseWorkbookToRawData if it came from Excel
  rawDataForEnrichment = JSON.parse(JSON.stringify(data));
  catalog = transformRawToInitialCatalog(rawDataForEnrichment); 
  saveCatalogToExcel(); 
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
  const datasetName = parts[0]; // Canonical name
  const tableName = parts.length > 1 ? parts[1] : undefined; // Canonical name
  const columnName = parts.length > 2 ? parts[2] : undefined; // Canonical name

  let rawDataFieldUpdated = false;
  let catalogFieldUpdated = false;

  // All lookups and assignments use canonical keys
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
  // const currentCatalog = catalog ? catalog : {datasets: []}; // Not needed here as we rebuild from raw
  // const datasetInCatalog = currentCatalog.datasets.find(d => d.name === datasetName);
  // if (!datasetInCatalog) {
  //   addLog(`[CatalogStore-UpdateKeysSQL] Dataset ${datasetName} not found in live catalog.`);
  //   return false;
  // }

  const tablesToUpdateInRaw = targetTableName 
    ? [targetTableName] 
    : Array.from(new Set([...keyInfo.primaryKeys.map(k => k.tableName), ...keyInfo.foreignKeys.map(k => k.tableName)]));
  
  addLog(`[CatalogStore-UpdateKeysSQL] Tables identified for key updates (from AI analysis): ${tablesToUpdateInRaw.join(', ')}`);

  tablesToUpdateInRaw.forEach(tableNameFromAI => {
    // Reset PK/FK for all columns of this table in this dataset in rawData
    rawDataForEnrichment!.columns.forEach(rawCol => {
      if (rawCol.TABLE_NAME === tableNameFromAI && rawDataForEnrichment!.tables.some(t => t.TABLE_NAME === tableNameFromAI && t.Dataset_name === datasetName)) {
        if (rawCol.PRIMARY_KEY === 'true') { rawCol.PRIMARY_KEY = 'false'; changesMade = true; }
        if (rawCol.FOREIGN_KEY === 'true') { rawCol.FOREIGN_KEY = 'false'; changesMade = true; }
      }
    });
  });

  keyInfo.primaryKeys.forEach(pk => {
    if (targetTableName && pk.tableName !== targetTableName) return; 
    // Find the column in rawDataForEnrichment and update it
    const rawCol = rawDataForEnrichment!.columns.find(c => 
        c.TABLE_NAME === pk.tableName && 
        c.COLUMN_NAME === pk.columnName && 
        rawDataForEnrichment!.tables.some(t => t.TABLE_NAME === pk.tableName && t.Dataset_name === datasetName)
    );
    if (rawCol && rawCol.PRIMARY_KEY !== 'true') {
      rawCol.PRIMARY_KEY = 'true';
      changesMade = true;
      addLog(`[CatalogStore-UpdateKeysSQL] Raw PK updated: ${pk.tableName}.${pk.columnName} set to true.`);
    } else if (rawCol && rawCol.PRIMARY_KEY === 'true') {
      addLog(`[CatalogStore-UpdateKeysSQL] Raw PK already true (no change): ${pk.tableName}.${pk.columnName}`);
    } else {
      addLog(`[CatalogStore-UpdateKeysSQL] Raw PK not found or no change for AI PK: ${pk.tableName}.${pk.columnName}`);
    }
  });

  keyInfo.foreignKeys.forEach(fk => {
    if (targetTableName && fk.tableName !== targetTableName) return;
    const rawCol = rawDataForEnrichment!.columns.find(c => 
        c.TABLE_NAME === fk.tableName && 
        c.COLUMN_NAME === fk.columnName && 
        rawDataForEnrichment!.tables.some(t => t.TABLE_NAME === fk.tableName && t.Dataset_name === datasetName)
    );
    if (rawCol && rawCol.FOREIGN_KEY !== 'true') {
      rawCol.FOREIGN_KEY = 'true';
      changesMade = true;
      addLog(`[CatalogStore-UpdateKeysSQL] Raw FK updated: ${fk.tableName}.${fk.columnName} set to true.`);
    } else if (rawCol && rawCol.FOREIGN_KEY === 'true') {
      addLog(`[CatalogStore-UpdateKeysSQL] Raw FK already true (no change): ${fk.tableName}.${fk.columnName}`);
    } else {
       addLog(`[CatalogStore-UpdateKeysSQL] Raw FK not found or no change for AI FK: ${fk.tableName}.${fk.columnName}`);
    }
  });

  if (changesMade) {
    // Rebuild the structured catalog from the updated rawDataForEnrichment
    catalog = transformRawToInitialCatalog(rawDataForEnrichment);
    await saveCatalogToExcel();
    addLog(`[CatalogStore-UpdateKeysSQL] Successfully updated key information in rawData, rebuilt catalog, and saved to Excel.`);
  } else {
    addLog(`[CatalogStore-UpdateKeysSQL] No changes made to key information in rawData based on AI analysis.`);
  }
  return changesMade;
}

if (typeof process !== 'undefined' && (!process.env.NODE_ENV || process.env.NODE_ENV !== 'test')) {
    loadAndInitializeCatalogFromDisk();
    addLog("[CatalogStore] Initial load attempt from disk complete on store module load.");
}

