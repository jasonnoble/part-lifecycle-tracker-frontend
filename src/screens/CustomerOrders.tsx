import { useId, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiList } from "../apiClient";
import type { Part } from "../api/types";
import { Badge, StatusBadge, type Tone } from "../components/Badge";
import { getRole } from "../roles";

// ---------------------------------------------------------------------------
// Types — mirror the real backend contract (camelCase, hyphenated endpoints).
// Customer-order lines DO NOT carry a fulfillment field; fulfillment is derived
// by cross-referencing supplier purchase orders (see deriveFulfillment).
// ---------------------------------------------------------------------------
type OrderLine = {
    id: string;
    quantity: number;
    partNumber: string;
    partName: string;
};

type CustomerOrder = {
    id: string;
    customerName: string;
    // Free-form on the backend; common values handled below, others fall back gracefully.
    status: string;
    lines: OrderLine[];
    createdAt: string;
    updatedAt: string;
};

type SupplierPoLine = {
    id: string;
    quantity: number;
    quantityReceived: number;
    status: string; // NEEDS_ORDERING | OPEN | RECEIVED | ORDERED | ...
    partNumber: string;
    partName: string;
};

type SupplierPurchaseOrder = {
    id: string;
    supplierId: string;
    status: string;
    customerOrderId: string | null;
    lines: SupplierPoLine[];
};

// Roles allowed to view/manage customer orders.
const ALLOWED_ROLES = new Set(["SALESPERSON", "SITE_MANAGER"]);

// ---------------------------------------------------------------------------
// Fulfillment derivation
// ---------------------------------------------------------------------------
// CO lines have no fulfillment flag. We derive a best-effort status by looking
// at supplier POs tied to THIS customer order (customerOrderId === order.id):
//   - "pending supplier PO": a matching supplier-PO line for the part exists
//     and is not yet RECEIVED (still NEEDS_ORDERING / ORDERED / OPEN, etc.)
//   - "in stock": no outstanding supplier-PO line for the part (either fully
//     received, or never needed a PO -> assumed satisfiable from stock)
// This is a derived heuristic, not an authoritative field; the UI labels it as such.
type DerivedFulfillment = "IN_STOCK" | "PENDING_PO";

function deriveFulfillment(
    partNumber: string,
    relatedPoLines: SupplierPoLine[],
): DerivedFulfillment {
    const matching = relatedPoLines.filter((l) => l.partNumber === partNumber);
    if (matching.length === 0) return "IN_STOCK";
    const hasOutstanding = matching.some(
        (l) => l.status.toUpperCase() !== "RECEIVED",
    );
    return hasOutstanding ? "PENDING_PO" : "IN_STOCK";
}

// ---------------------------------------------------------------------------
// Presentational helpers
// ---------------------------------------------------------------------------
// Order status is free-form on the backend; map the common values to tones and
// fall back to `neutral` for anything unrecognized.
const ORDER_STATUS_TONES: Record<string, Tone> = {
    OPEN: "info",
    SHIPPED: "info",
    DELIVERED: "success",
    CANCELLED: "danger",
};

function OrderStatusBadge({ status }: { status: string }) {
    return <StatusBadge value={status.toUpperCase()} tones={ORDER_STATUS_TONES} label={status} />;
}

function FulfillmentBadge({ fulfillment }: { fulfillment: DerivedFulfillment }) {
    const inStock = fulfillment === "IN_STOCK";
    return (
        <Badge tone={inStock ? "success" : "warning"}>
            {inStock ? "In stock" : "Pending supplier PO"}
        </Badge>
    );
}

// ---------------------------------------------------------------------------
// Order detail panel
// ---------------------------------------------------------------------------
function OrderDetail({ orderId }: { orderId: string }) {
    const { isPending, error, data } = useQuery({
        queryKey: ["customer-order", orderId],
        // Single resource is returned directly (not wrapped in { data, meta }).
        queryFn: () => api<CustomerOrder>(`/customer-orders/${orderId}`),
    });

    // Supplier POs are used to derive fulfillment for each line. We filter to
    // POs linked to this customer order. Loaded independently so the line data
    // still renders even if this lookup fails.
    const posQuery = useQuery({
        queryKey: ["supplier-purchase-orders"],
        queryFn: () => apiList<SupplierPurchaseOrder>("/supplier-purchase-orders"),
    });

    if (isPending) return <p className="p-4 text-sm text-gray-500">Loading order…</p>;
    if (error)
        return <p className="p-4 text-sm text-red-600">Error: {error.message}</p>;

    const relatedPoLines: SupplierPoLine[] = (posQuery.data ?? [])
        .filter((po) => po.customerOrderId === data.id)
        .flatMap((po) => po.lines);

    return (
        <div className="p-4">
            <div className="mb-3 flex items-center gap-2">
                <h3 className="text-base font-semibold text-gray-900">
                    Order {data.id}
                </h3>
                <OrderStatusBadge status={data.status} />
                <span className="text-sm text-gray-500">{data.customerName}</span>
            </div>
            <table className="w-full text-left text-sm">
                <thead>
                    <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                        <th className="py-2 pr-4 font-medium">Part</th>
                        <th className="py-2 pr-4 font-medium">Name</th>
                        <th className="py-2 pr-4 font-medium">Qty</th>
                        <th className="py-2 font-medium">Fulfillment</th>
                    </tr>
                </thead>
                <tbody>
                    {data.lines.map((line) => (
                        <tr
                            key={line.id}
                            className="border-b border-gray-100 last:border-0"
                        >
                            <td className="py-2 pr-4 font-mono text-gray-900">
                                {line.partNumber}
                            </td>
                            <td className="py-2 pr-4 text-gray-700">
                                {line.partName}
                            </td>
                            <td className="py-2 pr-4 text-gray-700">
                                {line.quantity}
                            </td>
                            <td className="py-2">
                                {posQuery.isPending ? (
                                    <span className="text-xs text-gray-400">
                                        deriving…
                                    </span>
                                ) : posQuery.error ? (
                                    <span
                                        title={`Could not load supplier POs: ${posQuery.error.message}`}
                                        className="text-xs text-gray-400"
                                    >
                                        unknown
                                    </span>
                                ) : (
                                    <FulfillmentBadge
                                        fulfillment={deriveFulfillment(
                                            line.partNumber,
                                            relatedPoLines,
                                        )}
                                    />
                                )}
                            </td>
                        </tr>
                    ))}
                    {data.lines.length === 0 && (
                        <tr>
                            <td colSpan={4} className="py-3 text-gray-500">
                                No line items.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
            <p className="mt-2 text-xs text-gray-400">
                Fulfillment is a derived best-effort estimate based on linked
                supplier purchase orders, not an authoritative order field.
            </p>
        </div>
    );
}

// ---------------------------------------------------------------------------
// New order form
// ---------------------------------------------------------------------------
type NewLine = { partNumber: string; quantity: number };
// A stable per-row key so React reconciles inputs correctly across add/remove;
// kept separate from the submitted payload shape.
type DraftLine = NewLine & { key: string };
type NewOrderPayload = { customerName: string; lines: NewLine[] };

function NewOrderForm({ onClose }: { onClose: () => void }) {
    const queryClient = useQueryClient();
    const lineKeyPrefix = useId();
    const [customerName, setCustomerName] = useState("");
    const [nextLineKey, setNextLineKey] = useState(1);
    const [lines, setLines] = useState<DraftLine[]>([
        { key: `${lineKeyPrefix}-0`, partNumber: "", quantity: 1 },
    ]);

    const partsQuery = useQuery({
        queryKey: ["parts"],
        queryFn: () => apiList<Part>("/parts"),
    });

    const createOrder = useMutation({
        mutationFn: (payload: NewOrderPayload) =>
            api<CustomerOrder>("/customer-orders", {
                method: "POST",
                body: JSON.stringify(payload),
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["customer-orders"] });
            onClose();
        },
    });

    function updateLine(index: number, patch: Partial<NewLine>) {
        setLines((prev) =>
            prev.map((l, i) => (i === index ? { ...l, ...patch } : l)),
        );
    }

    function addLine() {
        setLines((prev) => [
            ...prev,
            { key: `${lineKeyPrefix}-${nextLineKey}`, partNumber: "", quantity: 1 },
        ]);
        setNextLineKey((n) => n + 1);
    }

    function removeLine(index: number) {
        setLines((prev) => prev.filter((_, i) => i !== index));
    }

    function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const validLines: NewLine[] = lines
            .filter((l) => l.partNumber && l.quantity >= 1)
            .map(({ partNumber, quantity }) => ({ partNumber, quantity }));
        if (!customerName.trim() || validLines.length === 0) return;
        createOrder.mutate({
            customerName: customerName.trim(),
            lines: validLines,
        });
    }

    const canSubmit =
        customerName.trim().length > 0 &&
        lines.some((l) => l.partNumber && l.quantity >= 1);

    return (
        <form
            onSubmit={handleSubmit}
            className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4"
        >
            <h2 className="mb-3 text-base font-semibold text-gray-900">
                New Customer Order
            </h2>

            <label className="mb-4 flex max-w-md flex-col text-sm">
                <span className="mb-1 font-medium text-gray-700">
                    Customer name
                </span>
                <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g. Springfield Taxi Co"
                    className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
                    required
                />
            </label>

            <div className="mb-2 text-sm font-medium text-gray-700">
                Line items
            </div>
            <div className="flex flex-col gap-3">
                {lines.map((line, index) => (
                    <div
                        key={line.key}
                        className="flex flex-wrap items-end gap-4"
                    >
                        <label className="flex flex-col text-sm">
                            <span className="mb-1 font-medium text-gray-700">
                                Part
                            </span>
                            <select
                                value={line.partNumber}
                                onChange={(e) =>
                                    updateLine(index, {
                                        partNumber: e.target.value,
                                    })
                                }
                                className="min-w-56 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
                                required
                            >
                                <option value="" disabled>
                                    {partsQuery.isPending
                                        ? "Loading parts…"
                                        : "Select a part…"}
                                </option>
                                {partsQuery.data?.map((p) => (
                                    <option
                                        key={p.id}
                                        value={p.partNumber}
                                    >
                                        {p.partNumber} — {p.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="flex flex-col text-sm">
                            <span className="mb-1 font-medium text-gray-700">
                                Quantity
                            </span>
                            <input
                                type="number"
                                min={1}
                                value={line.quantity}
                                onChange={(e) =>
                                    updateLine(index, {
                                        quantity: Number(e.target.value),
                                    })
                                }
                                className="w-24 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
                                required
                            />
                        </label>
                        {lines.length > 1 && (
                            <button
                                type="button"
                                onClick={() => removeLine(index)}
                                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
                            >
                                Remove
                            </button>
                        )}
                    </div>
                ))}
            </div>

            <button
                type="button"
                onClick={addLine}
                className="mt-3 rounded-md border border-dashed border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
                + Add line item
            </button>

            <div className="mt-4 flex gap-2">
                <button
                    type="submit"
                    disabled={createOrder.isPending || !canSubmit}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                    {createOrder.isPending ? "Creating…" : "Create order"}
                </button>
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                    Cancel
                </button>
            </div>

            {partsQuery.error && (
                <p className="mt-2 text-sm text-red-600">
                    Could not load parts: {partsQuery.error.message}
                </p>
            )}
            {createOrder.error && (
                <p className="mt-2 text-sm text-red-600">
                    Could not create order: {createOrder.error.message}
                </p>
            )}
        </form>
    );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function CustomerOrders() {
    const role = getRole();
    const allowed = ALLOWED_ROLES.has(role);

    const [showNewForm, setShowNewForm] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const { isPending, error, data } = useQuery({
        queryKey: ["customer-orders"],
        queryFn: () => apiList<CustomerOrder>("/customer-orders"),
        enabled: allowed,
    });

    if (!allowed) {
        return (
            <div className="mx-auto max-w-2xl p-6">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
                    <h1 className="mb-1 text-lg font-semibold">Sales / Customer Orders</h1>
                    <p className="text-sm">
                        This screen is not available for your role. Customer orders are
                        only accessible to Salesperson and Site Manager.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-4xl p-6">
            <div className="mb-4 flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900">Customer Orders</h1>
                <button
                    onClick={() => setShowNewForm((v) => !v)}
                    className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                    New Customer Order
                </button>
            </div>

            {showNewForm && <NewOrderForm onClose={() => setShowNewForm(false)} />}

            {isPending && <p className="text-sm text-gray-500">Loading orders…</p>}
            {error && <p className="text-sm text-red-600">Error: {error.message}</p>}

            {data && (
                <ul className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200">
                    {data.length === 0 && (
                        <li className="p-4 text-sm text-gray-500">
                            No customer orders yet.
                        </li>
                    )}
                    {data.map((order) => {
                        const isOpen = selectedId === order.id;
                        return (
                            <li key={order.id}>
                                <button
                                    onClick={() =>
                                        setSelectedId(isOpen ? null : order.id)
                                    }
                                    className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-gray-50"
                                >
                                    <span className="flex items-center gap-3">
                                        <span className="font-mono text-sm text-gray-900">
                                            {order.id}
                                        </span>
                                        <span className="text-sm text-gray-500">
                                            {order.customerName}
                                        </span>
                                    </span>
                                    <span className="flex items-center gap-3">
                                        <OrderStatusBadge status={order.status} />
                                        <span className="text-xs text-gray-400">
                                            {isOpen ? "▲" : "▼"}
                                        </span>
                                    </span>
                                </button>
                                {isOpen && (
                                    <div className="border-t border-gray-100 bg-gray-50/50">
                                        <OrderDetail orderId={order.id} />
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
