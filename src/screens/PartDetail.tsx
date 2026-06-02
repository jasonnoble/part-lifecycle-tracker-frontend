import { useState } from "react";
import { useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../apiClient";

// --- Types (built against documented shapes; no live backend) -------------

type PartStatus = "DRAFT" | "RELEASED" | "OBSOLETE";

type BomLine = {
    component_part_number: string;
    name: string;
    quantity: number;
    deleted_at?: string | null;
};

type Part = {
    id: string;
    part_number: string;
    name: string;
    revision: string;
    status: PartStatus;
    bom: BomLine[];
    // instance counts keyed by instance status, e.g. { "IN_STOCK": 3, "SHIPPED": 1 }
    instance_counts: Record<string, number>;
};

// --- Status model: DRAFT -> RELEASED -> OBSOLETE --------------------------

const STATUS_FLOW: Record<PartStatus, PartStatus[]> = {
    DRAFT: ["RELEASED"],
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

// --- Raw /context modal ---------------------------------------------------

function ContextModal({
    partNumber,
    onClose,
}: {
    partNumber: string;
    onClose: () => void;
}) {
    const { isPending, error, data } = useQuery({
        queryKey: ["part", partNumber, "context"],
        // GET /parts/:partNumber/context returns the raw /context response.
        queryFn: () => api<unknown>(`/parts/${partNumber}/context`),
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

// --- Screen ---------------------------------------------------------------

export default function PartDetail() {
    const { partNumber } = useParams<{ partNumber: string }>();
    const queryClient = useQueryClient();
    const [showContext, setShowContext] = useState(false);

    const { isPending, error, data } = useQuery({
        queryKey: ["part", partNumber],
        // GET /parts/:partNumber returns the part object directly (incl. bom + instance_counts).
        queryFn: () => api<Part>(`/parts/${partNumber}`),
        enabled: Boolean(partNumber),
    });

    const transition = useMutation({
        // POST /parts/:partNumber/transition with { to: "RELEASED" }
        mutationFn: (to: PartStatus) =>
            api<Part>(`/parts/${partNumber}/transition`, {
                method: "POST",
                body: JSON.stringify({ to }),
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["part", partNumber] });
        },
    });

    if (isPending) return <p>Loading…</p>;
    if (error) return <p className="text-red-600">Error: {error.message}</p>;

    const part = data;
    const instanceStatuses = Object.keys(part.instance_counts ?? {});

    return (
        <div className="space-y-6 p-4">
            {/* Header */}
            <section>
                <h1 className="text-2xl font-bold">
                    {part.part_number} — {part.name}
                </h1>
                <p className="text-gray-600">
                    Revision {part.revision} ·{" "}
                    <span className="font-medium">{part.status}</span>
                </p>
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
                    {transition.isError && (
                        <span className="text-sm text-red-600">
                            {transition.error.message}
                        </span>
                    )}
                </div>
            </section>

            {/* Instance counts by status */}
            <section className="space-y-2">
                <h2 className="text-lg font-semibold">Instances by status</h2>
                {instanceStatuses.length === 0 ? (
                    <p className="text-gray-500">No instances.</p>
                ) : (
                    <ul className="flex flex-wrap gap-2">
                        {instanceStatuses.map((status) => (
                            <li
                                key={status}
                                className="rounded bg-gray-100 px-3 py-1 text-sm"
                            >
                                <span className="font-medium">{status}</span>:{" "}
                                {part.instance_counts[status]}
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* BOM */}
            <section className="space-y-2">
                <h2 className="text-lg font-semibold">Bill of Materials</h2>
                {part.bom?.length === 0 ? (
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
                            {part.bom?.map((line) => {
                                const deleted = Boolean(line.deleted_at);
                                return (
                                    <tr
                                        key={line.component_part_number}
                                        className={
                                            deleted
                                                ? "text-gray-400 line-through"
                                                : ""
                                        }
                                    >
                                        <td className="py-1 pr-4">
                                            {line.component_part_number}
                                        </td>
                                        <td className="py-1 pr-4">{line.name}</td>
                                        <td className="py-1 pr-4">{line.quantity}</td>
                                        <td className="py-1 pr-4 no-underline">
                                            {deleted
                                                ? formatDate(line.deleted_at as string)
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
