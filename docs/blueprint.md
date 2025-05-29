# **App Name**: DataSage Chat

## Core Features:

- Chat Interface: Chatbot interface for natural language interaction, guiding users to select a dataset first.
- Data Catalog Display: Display datasets in a tree structure with sensitivity indicators and drill-down capabilities.
- Excel File Upload: Upload and store an Excel file (.xlsx) at /catalog/catalog.xlsx, parsing datasets, tables, and columns.
- Metadata Enrichment: Enrich metadata on XLS upload by using Gemini as a tool to provide missing descriptions, relevant tags, and classify field sensitivity, then stores enriched data in memory.
- Admin Dashboard: Admin panel for uploading new XLS files, viewing/editing metadata, re-running enrichment, and downloading the metadata file.
- Chat Integration with Gemini: API endpoint (/api/chat) leveraging the enriched metadata and Gemini tool to generate SQL queries and summaries based on natural language input.
- Metadata Download: Download functionality for enriched metadata in the desired format.

## Style Guidelines:

- Primary color: Soft, muted blue (#79A4C7) evoking trust and reliability.
- Background color: Light gray (#F0F4F8) to provide a clean and non-distracting backdrop.
- Accent color: Muted purple (#A69CAC) for interactive elements and subtle highlights, positioned near blue on the color wheel to add depth without overwhelming.
- Clean, sans-serif fonts optimized for readability on data-rich interfaces.
- Consistent, professional icons to represent datasets, tables, and columns, with color-coded sensitivity levels.
- Well-structured layout with clear visual hierarchy to navigate datasets, tables, and columns easily.
- Subtle transitions and animations to enhance user experience, such as expanding tree views or loading indicators.