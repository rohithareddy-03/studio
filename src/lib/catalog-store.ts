
// src/lib/catalog-store.ts
import type { CatalogData, EnrichedDataset, EnrichedTable, EnrichedColumn, RawDataset, RawTable, RawColumn } from '@/types';
import { enrichMetadata as enrichMetadataAI, type EnrichMetadataInput, type EnrichMetadataOutput } from '@/ai/flows/enrich-metadata-on-upload';

// This is a simple in-memory store. Data will be lost when the server restarts.
// For a production environment, consider a persistent storage solution.
let catalog: CatalogData = { datasets: [] };
let rawDataForEnrichment: EnrichMetadataInput | null = null;

export async function initializeCatalog(rawDatasets: RawDataset[], rawTables: RawTable[], rawColumns: RawColumn[]): Promise<CatalogData> {
  rawDataForEnrichment = {
    datasets: rawDatasets.map(d => ({ ...d })), 
    tables: rawTables.map(t => ({ ...t })),
    columns: rawColumns.map(c => ({ ...c })),
  };

  try {
    const enriched: EnrichMetadataOutput = await enrichMetadataAI(rawDataForEnrichment);
    catalog = transformEnrichedDataToCatalog(enriched.datasets, enriched.tables, enriched.columns);
    return catalog;
  } catch (error) {
    console.error("Error enriching metadata:", error);
    // Fallback: use raw data if enrichment fails
    catalog = transformRawDataToCatalog(rawDatasets, rawTables, rawColumns);
    return catalog;
  }
}

export async function reEnrichCatalog(): Promise<CatalogData | null> {
  if (!rawDataForEnrichment) {
    console.warn("No raw data available to re-enrich catalog.");
    return null;
  }
  try {
    const enriched: EnrichMetadataOutput = await enrichMetadataAI(rawDataForEnrichment);
    catalog = transformEnrichedDataToCatalog(enriched.datasets, enriched.tables, enriched.columns);
    return catalog;
  } catch (error) {
    console.error("Error re-enriching metadata:", error);
    return null;
  }
}


function transformRawDataToCatalog(rawDatasets: RawDataset[], rawTables: RawTable[], rawColumns: RawColumn[]): CatalogData {
  const datasets: EnrichedDataset[] = rawDatasets.map(rd => {
    if (!rd.Dataset_name) {
        console.warn(`Skipping raw dataset with missing Dataset_name: ${JSON.stringify(rd)}`);
        return null;
    }
    const datasetTables = rawTables
      .filter(rt => rt.Dataset_name === rd.Dataset_name)
      .map(rt => {
        if (!rt.TABLE_NAME) {
            console.warn(`Skipping raw table with missing TABLE_NAME for dataset ${rd.Dataset_name}: ${JSON.stringify(rt)}`);
            return null;
        }
        const tableColumns = rawColumns
          .filter(rc => rc.TABLE_NAME === rt.TABLE_NAME)
          .map(rc => {
            if (!rc.COLUMN_NAME) {
                console.warn(`Skipping raw column with missing COLUMN_NAME for table ${rt.TABLE_NAME}: ${JSON.stringify(rc)}`);
                return null;
            }
            return {
              id: `${rd.Dataset_name}/${rt.TABLE_NAME}/${rc.COLUMN_NAME}`,
              name: rc.COLUMN_NAME,
              dataType: rc.DATA_TYPE,
              isPrimaryKey: rc.PRIMARY_KEY === 'true' || rc.PRIMARY_KEY === true,
              isForeignKey: rc.FOREIGN_KEY === 'true' || rc.FOREIGN_KEY === true,
              description: rc.column_description,
              tags: rc.Column_tags,
              sensitivity: rc.Sensitivity || 'unknown',
              location: rc.location,
            };
          }).filter((col): col is EnrichedColumn => col !== null);
        return {
          id: `${rd.Dataset_name}/${rt.TABLE_NAME}`,
          name: rt.TABLE_NAME,
          source: rt.source,
          location: rt.location,
          databaseName: rt.DATABASE_NAME,
          schemaName: rt.SCHEMA_NAME,
          owner: rt.OWNER,
          primaryKeys: rt.PRIMARY_KEYS,
          foreignKeys: rt.FOREIGN_KEYS,
          createdDate: rt.CREATED_DATE,
          updatedDate: rt.UPDATED_DATE,
          rowCount: rt.Row_count ? parseInt(rt.Row_count, 10) : undefined,
          description: rt.Description,
          tags: rt.Table_tags,
          sensitivity: rt.Sensitivity || 'unknown',
          columns: tableColumns,
        };
      }).filter((table): table is EnrichedTable => table !== null);

    return {
      id: rd.Dataset_name,
      name: rd.Dataset_name,
      description: rd.Dataset_description,
      tags: rd.Tags,
      source: rd.source,
      location: rd.location,
      sensitivity: 'unknown',
      tables: datasetTables,
    };
  }).filter((ds): ds is EnrichedDataset => ds !== null);
  return { datasets };
}


function transformEnrichedDataToCatalog(
  enrichedDatasets: RawDataset[],
  enrichedTables: RawTable[],
  enrichedColumns: RawColumn[]
): CatalogData {
  const datasetsMap = new Map<string, EnrichedDataset>();

  // Stage 1: Populate datasetsMap with initial dataset structures
  enrichedDatasets.forEach(ed => {
    if (!ed.Dataset_name) {
      console.warn(`Skipping dataset from AI output with missing Dataset_name: ${JSON.stringify(ed)}`);
      return; // Essential identifier missing
    }
    datasetsMap.set(ed.Dataset_name, {
      id: ed.Dataset_name,
      name: ed.Dataset_name,
      description: ed.Dataset_description,
      tags: ed.Tags,
      source: ed.source,
      location: ed.location,
      sensitivity: 'unknown', // Default or derive later if needed
      tables: [], // Initialize tables array
    });
  });

  // Stage 2: Populate tables and their columns within the datasetsMap
  enrichedTables.forEach(et => {
    if (!et.Dataset_name || !et.TABLE_NAME) {
      console.warn(`Skipping table from AI output with missing Dataset_name or TABLE_NAME: ${JSON.stringify(et)}`);
      return; // Essential identifiers missing
    }

    const dataset = datasetsMap.get(et.Dataset_name);
    if (dataset) {
      // Process columns for the current table
      const tableColumns: EnrichedColumn[] = enrichedColumns
        .filter(ec => ec.TABLE_NAME === et.TABLE_NAME) // Filter columns belonging to the current table
        .map(ec => {
          if (!ec.COLUMN_NAME) {
            console.warn(`Skipping column from AI output with missing COLUMN_NAME for table ${et.TABLE_NAME}: ${JSON.stringify(ec)}`);
            return null; // Skip column if its name is missing
          }
          return {
            id: `${dataset.name}/${et.TABLE_NAME}/${ec.COLUMN_NAME}`,
            name: ec.COLUMN_NAME,
            dataType: ec.DATA_TYPE,
            isPrimaryKey: ec.PRIMARY_KEY === 'true' || ec.PRIMARY_KEY === true,
            isForeignKey: ec.FOREIGN_KEY === 'true' || ec.FOREIGN_KEY === true,
            description: ec.column_description,
            tags: ec.Column_tags,
            sensitivity: ec.Sensitivity || 'unknown',
            location: ec.location,
          };
        })
        .filter((col): col is EnrichedColumn => col !== null); // Remove any nulls due to skipped columns

      const table: EnrichedTable = {
        id: `${dataset.name}/${et.TABLE_NAME}`,
        name: et.TABLE_NAME,
        source: et.source,
        location: et.location,
        databaseName: et.DATABASE_NAME,
        schemaName: et.SCHEMA_NAME,
        owner: et.OWNER,
        primaryKeys: et.PRIMARY_KEYS,
        foreignKeys: et.FOREIGN_KEYS,
        createdDate: et.CREATED_DATE,
        updatedDate: et.UPDATED_DATE,
        rowCount: et.Row_count ? parseInt(et.Row_count, 10) : undefined,
        description: et.Description, // Enriched by AI
        tags: et.Table_tags,        // Enriched by AI
        sensitivity: et.Sensitivity || 'unknown',
        columns: tableColumns, // Assign fully processed columns
      };
      dataset.tables.push(table);
    } else {
      console.warn(`Table ${et.TABLE_NAME} from AI output refers to a non-existent dataset ${et.Dataset_name}. Skipping table.`);
    }
  });
  
  return { datasets: Array.from(datasetsMap.values()) };
}


export function getCatalog(): CatalogData {
  return JSON.parse(JSON.stringify(catalog)); // Return a deep copy
}

export function getDatasetByName(name: string): EnrichedDataset | undefined {
  const currentCatalog = getCatalog(); // Use the function to get a fresh copy
  return currentCatalog.datasets.find(d => d.name === name);
}

export function getTableMetadata(datasetName: string, tableName: string): string | undefined {
  const dataset = getDatasetByName(datasetName);
  if (!dataset) return undefined;
  const table = dataset.tables.find(t => t.name === tableName);
  if (!table) return undefined;

  // Construct a metadata string for the AI
  let metadata = `Table: ${tableName}\nDescription: ${table.description || 'N/A'}\nSensitivity: ${table.sensitivity || 'N/A'}\nLocation: ${table.location || 'N/A'}\nColumns:\n`;
  table.columns.forEach(col => {
    metadata += `  - ${col.name} (Type: ${col.dataType || 'N/A'}, PK: ${col.isPrimaryKey}, FK: ${col.isForeignKey}, Sensitivity: ${col.sensitivity || 'N/A'}, Description: ${col.description || 'N/A'}, Location: ${col.location || 'N/A'})\n`;
  });
  return metadata;
}

// Used by /api/upload to store the initially parsed (but not yet AI enriched) data
export function storeRawDataForEnrichment(data: EnrichMetadataInput) {
  rawDataForEnrichment = data;
}

// Helper function to also ensure the fallback `transformRawDataToCatalog` includes null checks for primary identifiers
// This was partially done, but good to make consistent with the enriched version.
function ensureRawDataTransformationIsRobust() {
    // The transformRawDataToCatalog was already updated to include these checks.
    // This function is a placeholder to note the review.
}
ensureRawDataTransformationIsRobust();

```