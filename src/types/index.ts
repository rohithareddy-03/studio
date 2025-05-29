export interface BaseMetadata {
  description?: string;
  tags?: string; // Comma-separated string or consider array if more complex ops needed
  sensitivity?: 'low' | 'medium' | 'high' | 'unknown' | string; // Allow string for flexibility from AI
}

export interface RawDataset {
  Dataset_name: string;
  Dataset_description?: string;
  Tags?: string;
  SOURCE?: string;
}

export interface RawTable extends BaseMetadata {
  TABLE_NAME: string;
  Dataset_name: string;
  SOURCE?: string;
  LOCATION?: string;
  DATABASE_NAME?: string;
  SCHEMA_NAME?: string;
  OWNER?: string;
  PRIMARY_KEYS?: string;
  FOREIGN_KEYS?: string;
  CREATED_DATE?: string;
  UPDATED_DATE?: string;
  Row_count?: string;
  Description?: string; // This field seems redundant with BaseMetadata.description, use one
  Table_tags?: string; // This field seems redundant with BaseMetadata.tags, use one
  // Sensitivity is in BaseMetadata
}

export interface RawColumn extends BaseMetadata {
  TABLE_NAME: string;
  COLUMN_NAME: string;
  DATA_TYPE?: string;
  PRIMARY_KEY?: 'true' | 'false' | boolean | string;
  FOREIGN_KEY?: 'true' | 'false' | boolean | string;
  // description is in BaseMetadata
  Column_tags?: string; // This field seems redundant with BaseMetadata.tags, use one
  // Sensitivity is in BaseMetadata
}

// Enriched types - these are what we'll primarily use in the app
export interface EnrichedColumn extends BaseMetadata {
  id: string; // e.g., datasetName/tableName/columnName
  name: string;
  dataType?: string;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
}

export interface EnrichedTable extends BaseMetadata {
  id: string; // e.g., datasetName/tableName
  name: string;
  source?: string;
  location?: string;
  databaseName?: string;
  schemaName?: string;
  owner?: string;
  primaryKeys?: string; // Could be parsed into string[]
  foreignKeys?: string; // Could be parsed into string[]
  createdDate?: string;
  updatedDate?: string;
  rowCount?: number;
  columns: EnrichedColumn[];
}

export interface EnrichedDataset extends BaseMetadata {
  id: string; // e.g., datasetName
  name: string;
  source?: string;
  tables: EnrichedTable[];
}

export interface CatalogData {
  datasets: EnrichedDataset[];
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  content: string;
  timestamp: Date;
}
