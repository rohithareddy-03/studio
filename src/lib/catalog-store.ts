
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
    const datasetTables = rawTables
      .filter(rt => rt.Dataset_name === rd.Dataset_name)
      .map(rt => {
        const tableColumns = rawColumns
          .filter(rc => rc.TABLE_NAME === rt.TABLE_NAME)
          .map(rc => ({
            id: `${rd.Dataset_name}/${rt.TABLE_NAME}/${rc.COLUMN_NAME}`,
            name: rc.COLUMN_NAME,
            dataType: rc.DATA_TYPE,
            isPrimaryKey: rc.PRIMARY_KEY === 'true' || rc.PRIMARY_KEY === true,
            isForeignKey: rc.FOREIGN_KEY === 'true' || rc.FOREIGN_KEY === true,
            description: rc.column_description, // Use column_description
            tags: rc.Column_tags,
            sensitivity: rc.Sensitivity || 'unknown',
            location: rc.location, // Added location for columns
          }));
        return {
          id: `${rd.Dataset_name}/${rt.TABLE_NAME}`,
          name: rt.TABLE_NAME,
          source: rt.source, // Use raw source
          location: rt.location, // Use raw location
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
      });

    return {
      id: rd.Dataset_name,
      name: rd.Dataset_name,
      description: rd.Dataset_description,
      tags: rd.Tags,
      source: rd.source, // Use raw source
      location: rd.location, // Use raw location
      sensitivity: 'unknown', // Dataset level sensitivity not in raw, can be added or derived
      tables: datasetTables,
    };
  });
  return { datasets };
}


function transformEnrichedDataToCatalog(
  enrichedDatasets: RawDataset[], // AI output schema matches RawDataset (with optional location, source)
  enrichedTables: RawTable[],   // AI output schema matches RawTable
  enrichedColumns: RawColumn[]  // AI output schema matches RawColumn (with optional location, column_description)
): CatalogData {
  const datasetsMap = new Map<string, EnrichedDataset>();

  enrichedDatasets.forEach(ed => {
    datasetsMap.set(ed.Dataset_name, {
      id: ed.Dataset_name,
      name: ed.Dataset_name,
      description: ed.Dataset_description, // Enriched by AI
      tags: ed.Tags,
      source: ed.source, // From input, preserved by AI
      location: ed.location, // From input, preserved by AI
      sensitivity: 'unknown', // Not handled by AI enrichment as per new prompt
      tables: [],
    });
  });

  enrichedTables.forEach(et => {
    const dataset = datasetsMap.get(et.Dataset_name);
    if (dataset) {
      const table: EnrichedTable = {
        id: `${et.Dataset_name}/${et.TABLE_NAME}`,
        name: et.TABLE_NAME,
        source: et.source, // From input, preserved by AI
        location: et.location, // From input, preserved by AI
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
        sensitivity: et.Sensitivity || 'unknown', // From input, preserved by AI
        columns: [],
      };
      dataset.tables.push(table);
    }
  });

  enrichedColumns.forEach(ec => {
    for (const dataset of datasetsMap.values()) {
      // Find the parent dataset name for the current column's table
      const parentDatasetName = enrichedTables.find(et => et.TABLE_NAME === ec.TABLE_NAME)?.Dataset_name;
      if (dataset.name === parentDatasetName) {
        const table = dataset.tables.find(t => t.name === ec.TABLE_NAME);
        if (table) {
          const column: EnrichedColumn = {
            id: `${dataset.name}/${table.name}/${ec.COLUMN_NAME}`,
            name: ec.COLUMN_NAME,
            dataType: ec.DATA_TYPE,
            isPrimaryKey: ec.PRIMARY_KEY === 'true' || ec.PRIMARY_KEY === true,
            isForeignKey: ec.FOREIGN_KEY === 'true' || ec.FOREIGN_KEY === true,
            description: ec.column_description,    // Enriched by AI
            tags: ec.Column_tags,                 // Enriched by AI
            sensitivity: ec.Sensitivity || 'unknown', // From input, preserved by AI
            location: ec.location, // From input, preserved by AI
          };
          table.columns.push(column);
          break; 
        }
      }
    }
  });
  
  return { datasets: Array.from(datasetsMap.values()) };
}


export function getCatalog(): CatalogData {
  return JSON.parse(JSON.stringify(catalog)); // Return a deep copy
}

export function getDatasetByName(name: string): EnrichedDataset | undefined {
  return catalog.datasets.find(d => d.name === name);
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

