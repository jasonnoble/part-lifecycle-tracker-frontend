import { useState } from "react";
import { useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "../apiClient";

// --- Types (camelCase, matching the real backend) ------------------------

type PartStatus = "DRAFT" | "RELEASED" | "OBSOLETE";

// GET /parts/:partNumber — header info only.
type Part = {
    id: string;
    partNumber: string;
    name: string;
    description: string | null;
    revision: string | null;
    status: PartStatus;
    createdAt: string;
    updatedAt: string;
};

// GET /parts/:partNumber/bom — { data: BomItem[] } (no meta).
type BomDependency = {
    prerequisiteBomItemId: string;
    prerequisitePartNumber: string;
};

type BomItem = {
    id: string;
    quantity: number;
    childPartNumber: string;
    childPartName: string;
    deletedAt: string | null;
    dependencies: BomDependency[];
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

// --- Screen --------------------------------------------------------------

export default function PartDetail() {
    const { partNumber } = useParams<{ partNumber: string }>();
    const queryClient = useQueryClient();
    const [showContext, setShowContext] = useState(false);

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

    // Header drives the screen; gate on the part query.
    if (partQuery.isPending) return <p>Loading…</p>;
    if (partQuery.error)
        return <p className="text-red-600">Error: {partQuery.error.message}</p>;

    const part = partQuery.data;
    const bomLines = bomQuery.data?.data ?? [];
    const byStatus = contextQuery.data?.inventory?.byStatus ?? {};
    const instanceStatuses = Object.keys(byStatus);

    const transitionError =
        transition.error instanceof ApiError
            ? transition.error
            : transition.error
              ? new ApiError(transition.error.message, 0)
              : null;

    return (
        <div className="space-y-6 p-4">
            {/* Header */}
            <section>
                <h1 className="text-2xl font-bold">
                    {part.partNumber} — {part.name}
                </h1>
                <p className="text-gray-600">
                    Revision {part.revision ?? "—"} ·{" "}
                    <span className="font-medium">{part.status}</span>
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
                                className="rounded border px-3 py-1.5 text-sm font-medium enabled:hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                → {to}
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
                    <p className="text-gray-500">No instances.</p>
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
                <h2 className="text-lg font-semibold">Bill of Materials</h2>
                {bomQuery.isPending ? (
                    <p className="text-gray-500">Loading…</p>
                ) : bomQuery.error ? (
                    <p className="text-red-600">Error: {bomQuery.error.message}</p>
                ) : bomLines.length === 0 ? (
                    <p className="text-gray-500">No BOM lines.</p>
                ) : (
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr className="border-b text-left">
                                <th className="py-1 pr-4">Component</th>
                                <th className="py-1 pr-4">Name</th>
                                <th className="py-1 pr-4">Qty</th>
                                <th className="py-1 pr-4">Deleted</th>
                            </tr>
                        </thead>
                        <tbody>
                            {bomLines.map((line) => {
                                const { deletedAt } = line;
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
                                            {line.childPartNumber}
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
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </section>

            {/* Raw /context */}
            <section>
                <button
                    type="button"
                    onClick={() => setShowContext(true)}
                    className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
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
