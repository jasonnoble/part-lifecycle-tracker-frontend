import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api, apiList } from "../apiClient";
import { StatusBadge, type Tone } from "../components/Badge";
import type { BomItem, Part, PartStatus } from "../api/types";
import { useDocumentTitle } from "../useDocumentTitle";

// Surface a thrown value as a user-facing message, prefixing the server's
// `[code]` for ApiErrors (e.g. [CHILD_NOT_FOUND]).
function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    return `${err.code ? `[${err.code}] ` : ""}${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return "Request failed";
}

// --- Types (camelCase, matching the real backend) ------------------------
// Part / BomItem / PartStatus are shared via ../api/types. The /bom endpoint
// returns { data } with no meta, so it is fetched as api<{ data: BomItem[] }>.

// Map part status to a Badge tone for the header pill.
const STATUS_TONES: Record<PartStatus, Tone> = {
  DRAFT: "warning",
  RELEASED: "success",
  OBSOLETE: "neutral",
};

// GET /parts/:partNumber/context — rich payload; only the bits we read are typed.
type PartContext = {
  partNumber: string;
  name: string;
  revision: string | null;
  status: PartStatus;
  summary: string;
  inventory: {
    total: number;
    byStatus: Record<string, number>;
  };
  openPurchaseOrders: number;
  bom: unknown[];
  recentEvents: unknown[];
  generatedAt: string;
  [key: string]: unknown;
};

// --- Status model: DRAFT -> RELEASED -> OBSOLETE -------------------------
// Valid: DRAFT->RELEASED, DRAFT->OBSOLETE, RELEASED->OBSOLETE.

const STATUS_FLOW: Record<PartStatus, PartStatus[]> = {
  DRAFT: ["RELEASED", "OBSOLETE"],
  RELEASED: ["OBSOLETE"],
  OBSOLETE: [],
};

const ALL_TARGETS: PartStatus[] = ["DRAFT", "RELEASED", "OBSOLETE"];

function canTransition(from: PartStatus, to: PartStatus): boolean {
  return STATUS_FLOW[from]?.includes(to) ?? false;
}

// Human label for a status-transition button, e.g. "Mark as Obsolete".
function transitionLabel(to: PartStatus): string {
  return `Mark as ${to.charAt(0)}${to.slice(1).toLowerCase()}`;
}

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

// --- Raw /context modal --------------------------------------------------

function ContextModal({
  partNumber,
  onClose,
}: {
  partNumber: string;
  onClose: () => void;
}) {
  const { isPending, error, data } = useQuery({
    queryKey: ["part", partNumber, "context"],
    // GET /parts/:partNumber/context returns the full context payload.
    queryFn: () => api<PartContext>(`/parts/${partNumber}/context`),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Raw /context response"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-lg font-semibold">Raw /context response</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="overflow-auto p-4">
          {isPending && <p>Loading…</p>}
          {error && <p className="text-red-600">Error: {error.message}</p>}
          {!isPending && !error && (
            <pre className="overflow-auto rounded bg-gray-900 p-4 text-xs text-green-200">
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Add BOM item form ---------------------------------------------------
// Inline editor shown only while the parent part is DRAFT. Lets you pick a
// child part, a quantity, and optional prerequisite BOM items (the new line is
// blocked until those are certified during assembly). Stays open after a
// successful add so a BOM can be built up quickly.

function AddBomItemForm({
  partNumber,
  existingItems,
  onClose,
}: {
  partNumber: string;
  existingItems: BomItem[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [childPartNumber, setChildPartNumber] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [prerequisites, setPrerequisites] = useState<string[]>([]);

  // Parts to offer as children — every part except the one being edited.
  const partsQuery = useQuery({
    queryKey: ["parts"],
    queryFn: () => apiList<Part>("/parts"),
  });
  const childOptions = (partsQuery.data ?? []).filter(
    (p) => p.partNumber !== partNumber,
  );

  const addItem = useMutation({
    mutationFn: () =>
      api<BomItem>(`/parts/${partNumber}/bom`, {
        method: "POST",
        body: JSON.stringify({
          childPartNumber,
          quantity,
          prerequisites,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["part", partNumber, "bom"] });
      queryClient.invalidateQueries({
        queryKey: ["part", partNumber, "context"],
      });
      // Reset for the next line but keep the form open for rapid entry.
      setChildPartNumber("");
      setQuantity(1);
      setPrerequisites([]);
    },
  });

  const canSubmit = childPartNumber !== "" && quantity >= 1;

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    addItem.mutate();
  }

  function togglePrerequisite(id: string) {
    setPrerequisites((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Add BOM item"
      className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4"
    >
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col text-sm">
          <span className="mb-1 font-medium text-gray-700">Child part</span>
          <select
            value={childPartNumber}
            onChange={(e) => setChildPartNumber(e.target.value)}
            className="min-w-56 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
            required
          >
            <option value="" disabled>
              {partsQuery.isPending ? "Loading parts…" : "Select a part…"}
            </option>
            {childOptions.map((p) => (
              <option key={p.id} value={p.partNumber}>
                {p.partNumber} — {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col text-sm">
          <span className="mb-1 font-medium text-gray-700">Quantity</span>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="w-24 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
            required
          />
        </label>
      </div>

      {existingItems.length > 0 && (
        <fieldset className="mt-3">
          <legend className="mb-1 text-sm font-medium text-gray-700">
            Prerequisites{" "}
            <span className="font-normal text-gray-400">
              (must be certified first — optional)
            </span>
          </legend>
          <div className="flex flex-wrap gap-3">
            {existingItems.map((item) => (
              <label
                key={item.id}
                className="flex items-center gap-1.5 text-sm text-gray-700"
              >
                <input
                  type="checkbox"
                  checked={prerequisites.includes(item.id)}
                  onChange={() => togglePrerequisite(item.id)}
                />
                <span className="font-mono text-xs">
                  {item.childPartNumber}
                </span>
                <span>{item.childPartName}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="submit"
          disabled={!canSubmit || addItem.isPending}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {addItem.isPending ? "Adding…" : "Add item"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          Done
        </button>
        {addItem.error && (
          <span className="text-sm text-red-600">
            {errorMessage(addItem.error)}
          </span>
        )}
      </div>
    </form>
  );
}

// --- Screen --------------------------------------------------------------

export default function PartDetail() {
  const { partNumber } = useParams<{ partNumber: string }>();
  useDocumentTitle(partNumber);
  const queryClient = useQueryClient();
  const [showContext, setShowContext] = useState(false);
  const [showAddBom, setShowAddBom] = useState(false);
  // Inline error for a failed BOM-row delete, keyed by bom item id.
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});

  const enabled = Boolean(partNumber);

  // The detail view is assembled from three separate endpoints.
  const partQuery = useQuery({
    queryKey: ["part", partNumber],
    queryFn: () => api<Part>(`/parts/${partNumber}`),
    enabled,
  });

  const bomQuery = useQuery({
    queryKey: ["part", partNumber, "bom"],
    queryFn: () => api<{ data: BomItem[] }>(`/parts/${partNumber}/bom`),
    enabled,
  });

  const contextQuery = useQuery({
    queryKey: ["part", partNumber, "context"],
    queryFn: () => api<PartContext>(`/parts/${partNumber}/context`),
    enabled,
  });

  const transition = useMutation({
    // POST /parts/:partNumber/status with { status }.
    mutationFn: (status: PartStatus) =>
      api<Part>(`/parts/${partNumber}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["part", partNumber] });
      queryClient.invalidateQueries({
        queryKey: ["part", partNumber, "context"],
      });
    },
  });

  const deleteBomItem = useMutation({
    // DELETE /parts/:partNumber/bom/:bomItemId — soft-deletes the line.
    mutationFn: (bomItemId: string) =>
      api<BomItem>(`/parts/${partNumber}/bom/${bomItemId}`, {
        method: "DELETE",
      }),
    onSuccess: (_data, bomItemId) => {
      setDeleteErrors((prev) => {
        const next = { ...prev };
        delete next[bomItemId];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["part", partNumber, "bom"] });
      queryClient.invalidateQueries({
        queryKey: ["part", partNumber, "context"],
      });
    },
    onError: (err: unknown, bomItemId) => {
      setDeleteErrors((prev) => ({ ...prev, [bomItemId]: errorMessage(err) }));
    },
  });

  // Header drives the screen; gate on the part query.
  if (partQuery.isPending) return <p>Loading…</p>;
  if (partQuery.error)
    return <p className="text-red-600">Error: {partQuery.error.message}</p>;

  const part = partQuery.data;
  const bomLines = bomQuery.data?.data ?? [];
  // The BOM is editable only while the part is DRAFT (locked once RELEASED).
  const isDraft = part.status === "DRAFT";
  // Live (non-deleted) lines are the only valid prerequisites for a new line.
  const activeBomItems = bomLines.filter((l) => !l.deletedAt);
  const byStatus = contextQuery.data?.inventory?.byStatus ?? {};
  const instanceStatuses = Object.keys(byStatus);

  const transitionError =
    transition.error instanceof ApiError
      ? transition.error
      : transition.error
       ? new ApiError(transition.error.message, 0)
       : null;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-sm text-gray-500">
        <Link to="/parts" className="hover:text-gray-700 hover:underline">
          Parts
        </Link>
        <span className="px-1.5 text-gray-300">/</span>
        <span className="text-gray-700">{part.partNumber}</span>
      </nav>

      {/* Header */}
      <section>
        <h1 className="text-2xl font-bold">
          {part.partNumber} — {part.name}
        </h1>
        <p className="text-gray-600">
          Revision {part.revision ?? "—"} ·{" "}
          <StatusBadge value={part.status} tones={STATUS_TONES} />
        </p>
        {part.description && (
          <p className="mt-1 text-gray-600">{part.description}</p>
        )}
      </section>

      {/* Status transition controls */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Status</h2>
        <div className="flex flex-wrap items-center gap-2">
          {ALL_TARGETS.filter((t) => t !== part.status).map((to) => {
            const allowed = canTransition(part.status, to);
            return (
              <button
                key={to}
                type="button"
                disabled={!allowed || transition.isPending}
                onClick={() => transition.mutate(to)}
                title={
                  allowed
                    ? `Transition to ${to}`
                    : `Cannot transition from ${part.status} to ${to}`
                }
                className="rounded-md border px-3 py-1.5 text-sm font-medium enabled:border-blue-600 enabled:bg-blue-600 enabled:text-white enabled:hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400"
              >
                {transitionLabel(to)}
              </button>
            );
          })}
          {transitionError && (
            <span className="text-sm text-red-600">
              {transitionError.code === "INVALID_TRANSITION"
                ? `Invalid transition: ${transitionError.message}`
                : transitionError.message}
            </span>
          )}
        </div>
      </section>

      {/* Instance counts by status (from /context inventory.byStatus) */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Instances by status</h2>
        {contextQuery.isPending ? (
          <p className="text-gray-500">Loading…</p>
        ) : contextQuery.error ? (
          <p className="text-red-600">
            Error: {contextQuery.error.message}
          </p>
        ) : instanceStatuses.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
            No instances.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {instanceStatuses.map((status) => (
              <li
                key={status}
                className="rounded bg-gray-100 px-3 py-1 text-sm"
              >
                <span className="font-medium">{status}</span>:{" "}
                {byStatus[status]}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* BOM */}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Bill of Materials</h2>
          {isDraft && !showAddBom && (
            <button
              type="button"
              onClick={() => setShowAddBom(true)}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Add BOM item
            </button>
          )}
        </div>

        {isDraft ? (
          showAddBom && partNumber ? (
            <AddBomItemForm
              partNumber={partNumber}
              existingItems={activeBomItems}
              onClose={() => setShowAddBom(false)}
            />
          ) : null
        ) : (
          <p className="text-sm text-gray-500">
            The BOM is locked because this part is {part.status}. Only DRAFT
            parts can be edited.
          </p>
        )}

        {bomQuery.isPending ? (
          <p className="text-gray-500">Loading…</p>
        ) : bomQuery.error ? (
          <p className="text-red-600">Error: {bomQuery.error.message}</p>
        ) : bomLines.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
            No BOM lines.
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-1 pr-4">Component</th>
                <th className="py-1 pr-4">Name</th>
                <th className="py-1 pr-4">Qty</th>
                <th className="py-1 pr-4">Deleted</th>
                {isDraft && <th className="py-1 pr-4">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {bomLines.map((line) => {
                const { deletedAt } = line;
                const removing =
                  deleteBomItem.isPending &&
                  deleteBomItem.variables === line.id;
                return (
                  <tr
                    key={line.id}
                    className={
                      deletedAt
                        ? "text-gray-400 line-through"
                        : ""
                    }
                  >
                    <td className="py-1 pr-4">
                      <Link
                        to={`/parts/${encodeURIComponent(line.childPartNumber)}`}
                        className="text-blue-600 hover:underline"
                      >
                        {line.childPartNumber}
                      </Link>
                    </td>
                    <td className="py-1 pr-4">
                      {line.childPartName}
                    </td>
                    <td className="py-1 pr-4">
                      {line.quantity}
                    </td>
                    <td className="py-1 pr-4 no-underline">
                      {deletedAt
                        ? formatDate(deletedAt)
                        : "—"}
                    </td>
                    {isDraft && (
                      <td className="py-1 pr-4 no-underline">
                        {deletedAt ? null : (
                          <div className="flex flex-col items-start gap-0.5">
                            <button
                              type="button"
                              disabled={removing}
                              onClick={() => deleteBomItem.mutate(line.id)}
                              aria-label={`Remove ${line.childPartName} from the BOM`}
                              className="text-sm font-medium text-red-600 hover:text-red-700 hover:underline disabled:cursor-not-allowed disabled:text-gray-400"
                            >
                              {removing ? "Removing…" : "Remove"}
                            </button>
                            {deleteErrors[line.id] && (
                              <span className="text-xs text-red-600">
                                {deleteErrors[line.id]}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Raw /context — developer/debug affordance, intentionally low-key */}
      <section className="border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={() => setShowContext(true)}
          className="text-sm font-medium text-gray-500 underline-offset-2 hover:text-gray-700 hover:underline"
        >
          View /context
        </button>
      </section>

      {showContext && partNumber && (
        <ContextModal
          partNumber={partNumber}
          onClose={() => setShowContext(false)}
        />
      )}
    </div>
  );
}
