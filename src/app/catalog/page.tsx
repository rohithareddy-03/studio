
// src/app/catalog/page.tsx
"use client"; // MetadataTreeView uses client-side hooks from useCatalog

import { MetadataTreeView } from '@/components/admin/MetadataTreeView';

export default function CatalogPage() {
  // The MetadataTreeView component already includes its own Card structure
  // with a title and actions, so we can render it directly.
  return (
    <div className="py-2 sm:py-4 lg:py-6"> {/* Added some top padding similar to other pages */}
      <MetadataTreeView />
    </div>
  );
}
