
export interface BaseMetadata {
  description?: string;
  tags?: string; // Comma-separated string or consider array if more complex ops needed
  sensitivity?: 'low' | 'medium' | 'high' | 'unknown' | string; // Allow string for flexibility from AI
  location?: string; // Added location here as it can apply to various levels
}

export interface RawDataset {
  Dataset_name: string;
  Dataset_description?: string;
  Tags?: string;
  source?: string; // Changed from SOURCE to source
  location?: string;
}

export interface RawTable {
  TABLE_NAME: string;
  Dataset_name: string;
  source?: string; // Changed from SOURCE to source
  location?: string;
  DATABASE_NAME?: string;
  SCHEMA_NAME?: string;
  OWNER?: string;
  PRIMARY_KEYS?: string;
  FOREIGN_KEYS?: string;
  CREATED_DATE?: string;
  UPDATED_DATE?: string;
  Row_count?: string;
  Description?: string;
  Table_tags?: string;
  Sensitivity?: string;
}

export interface RawColumn {
  TABLE_NAME: string;
  COLUMN_NAME: string;
  DATA_TYPE?: string;
  PRIMARY_KEY?: 'true' | 'false' | boolean | string;
  FOREIGN_KEY?: 'true' | 'false' | boolean | string;
  column_description?: string; // Changed from description to column_description
  Column_tags?: string;
  Sensitivity?: string;
  location?: string; // Added location for columns
}

// Enriched types - these are what we'll primarily use in the app
export interface EnrichedColumn extends BaseMetadata {
  id: string; // e.g., datasetName/tableName/columnName
  name: string;
  dataType?: string;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  // location is inherited from BaseMetadata
}

export interface EnrichedTable extends BaseMetadata {
  id: string; // e.g., datasetName/tableName
  name: string;
  source?: string;
  // location is inherited from BaseMetadata
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
  // location is inherited from BaseMetadata
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

