// Shared API types mirroring the backend OpenAPI contract.
// Responses are camelCase; list endpoints use the pagy-style envelope.

export type PageMeta = {
  currentPage: number;
  totalPages: number;
  totalCount: number;
};

/** Pagy-style list envelope returned by index endpoints. */
export type Paginated<T> = {
  data: T[];
  meta: PageMeta;
};

export type PartStatus = "DRAFT" | "RELEASED" | "OBSOLETE";

export type Part = {
  id: string;
  partNumber: string;
  name: string;
  description: string;
  revision: string | null;
  status: PartStatus;
  createdAt: string;
  updatedAt: string;
};

export type BomDependency = {
  prerequisiteBomItemId: string | null;
  prerequisitePartNumber: string | null;
};

export type BomItem = {
  id: string;
  quantity: number;
  childPartNumber: string;
  childPartName: string;
  /** Non-null when soft-deleted; such rows are still returned. */
  deletedAt: string | null;
  dependencies: BomDependency[];
};
