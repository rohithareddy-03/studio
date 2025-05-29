
export interface BaseMetadata {
  description?: string;
  tags?: string; // Comma-separated string or consider array if more complex ops needed
  sensitivity?: 'low' | 'medium' | 'high' | 'unknown' | string; // Allow string for flexibility from AI
  location?: string; // Added location here as it can apply to various levels
}

export interface RawDataset {
  Dataset_name: string; // Primary key for this dataset
  Dataset_description?: string;
  Tags?: string;
  source?: string; 
  location?: string;
}

export interface RawTable {
  TABLE_NAME: string; // Primary key for this table (within its dataset)
  Dataset_name: string; // Foreign key linking to RawDataset.Dataset_name
  source?: string; 
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
  TABLE_NAME: string; // Foreign key linking to RawTable.TABLE_NAME
  COLUMN_NAME: string; // Primary key for this column (within its table)
  DATA_TYPE?: string;
  PRIMARY_KEY?: 'true' | 'false' | boolean | string;
  FOREIGN_KEY?: 'true' | 'false' | boolean | string;
  column_description?: string; 
  Column_tags?: string;
  Sensitivity?: string;
  location?: string; 
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
