import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../apiClient";
import { getRole } from "../roles";

// ---------------------------------------------------------------------------
// Types — see PR body for documented API shapes / assumptions.
// ---------------------------------------------------------------------------
type Fulfillment = "IN_STOCK" | "PENDING_PO";

type OrderLine = {
    part_number: string;
    name: string;
    quantity: number;
    fulfillment: Fulfillment;
};

type CustomerOrder = {
    id: string;
    // Free-form on the backend; common values handled below, others fall back gracefully.
    status: string;
    customer_name?: string;
    lines: OrderLine[];
};

type Part = { id: string; part_number: string; name: string; status: string };

// Roles allowed to view/manage customer orders.
const ALLOWED_ROLES = new Set(["SALESPERSON", "SITE_MANAGER"]);

// ---------------------------------------------------------------------------
// Presentational helpers
// ---------------------------------------------------------------------------
function orderStatusClasses(status: string): string {
    switch (status.toUpperCase()) {
        case "DELIVERED":
        case "FULFILLED":
        case "COMPLETE":
            return "bg-green-100 text-green-800 ring-green-600/20";
        case "SHIPPED":
            return "bg-blue-100 text-blue-800 ring-blue-600/20";
        case "PENDING":
        case "AWAITING_STOCK":
        case "BACKORDERED":
            return "bg-amber-100 text-amber-800 ring-amber-600/20";
        case "CANCELLED":
        case "CANCELED":
            return "bg-red-100 text-red-800 ring-red-600/20";
        default:
            return "bg-gray-100 text-gray-700 ring-gray-500/20";
    }
}

function StatusBadge({ status }: { status: string }) {
    return (
        <span
            className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${orderStatusClasses(
                status,
            )}`}
        >
            {status}
        </span>
    );
}

function FulfillmentBadge({ fulfillment }: { fulfillment: Fulfillment }) {
    const inStock = fulfillment === "IN_STOCK";
    return (
        <span
            className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                inStock
                    ? "bg-green-100 text-green-800 ring-green-600/20"
                    : "bg-orange-100 text-orange-800 ring-orange-600/20"
            }`}
        >
            {inStock ? "In stock" : "Pending supplier PO"}
        </span>
    );
}

// ---------------------------------------------------------------------------
// Order detail panel
// ---------------------------------------------------------------------------
function OrderDetail({ orderId }: { orderId: string }) {
    const { isPending, error, data } = useQuery({
        queryKey: ["customer_order", orderId],
        // Single resource is returned directly (not wrapped in { data, meta }).
        queryFn: () => api<CustomerOrder>(`/customer_orders/${orderId}`),
    });

    if (isPending) return <p className="p-4 text-sm text-gray-500">Loading order…</p>;
    if (error)
        return <p className="p-4 text-sm text-red-600">Error: {error.message}</p>;

    return (
        <div className="p-4">
            <div className="mb-3 flex items-center gap-2">
                <h3 className="text-base font-semibold text-gray-900">
                    Order {data.id}
                </h3>
                <StatusBadge status={data.status} />
                {data.customer_name && (
                    <span className="text-sm text-gray-500">{data.customer_name}</span>
                )}
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
                            key={line.part_number}
                            className="border-b border-gray-100 last:border-0"
                        >
                            <td className="py-2 pr-4 font-mono text-gray-900">
                                {line.part_number}
                            </td>
                            <td className="py-2 pr-4 text-gray-700">{line.name}</td>
                            <td className="py-2 pr-4 text-gray-700">{line.quantity}</td>
                            <td className="py-2">
                                <FulfillmentBadge fulfillment={line.fulfillment} />
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
        </div>
    );
}

// ---------------------------------------------------------------------------
// New order form
// ---------------------------------------------------------------------------
type NewOrderPayload = { lines: { part_number: string; quantity: number }[] };

function NewOrderForm({ onClose }: { onClose: () => void }) {
    const queryClient = useQueryClient();
    const [partNumber, setPartNumber] = useState("");
    const [quantity, setQuantity] = useState(1);

    const partsQuery = useQuery({
        queryKey: ["parts"],
        queryFn: () => api<{ data: Part[] }>("/parts"),
    });

    const createOrder = useMutation({
        mutationFn: (payload: NewOrderPayload) =>
            api<CustomerOrder>("/customer_orders", {
                method: "POST",
                body: JSON.stringify(payload),
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["customer_orders"] });
            onClose();
        },
    });

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!partNumber || quantity < 1) return;
        createOrder.mutate({ lines: [{ part_number: partNumber, quantity }] });
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4"
        >
            <h2 className="mb-3 text-base font-semibold text-gray-900">
                New Customer Order
            </h2>
            <div className="flex flex-wrap items-end gap-4">
                <label className="flex flex-col text-sm">
                    <span className="mb-1 font-medium text-gray-700">Part</span>
                    <select
                        value={partNumber}
                        onChange={(e) => setPartNumber(e.target.value)}
                        className="min-w-56 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
                        required
                    >
                        <option value="" disabled>
                            {partsQuery.isPending ? "Loading parts…" : "Select a part…"}
                        </option>
                        {partsQuery.data?.data.map((p) => (
                            <option key={p.id} value={p.part_number}>
                                {p.part_number} — {p.name}
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
                <div className="flex gap-2">
                    <button
                        type="submit"
                        disabled={createOrder.isPending || !partNumber}
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
        queryKey: ["customer_orders"],
        queryFn: () => api<{ data: CustomerOrder[] }>("/customer_orders"),
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
                    {data.data.length === 0 && (
                        <li className="p-4 text-sm text-gray-500">
                            No customer orders yet.
                        </li>
                    )}
                    {data.data.map((order) => {
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
                                        {order.customer_name && (
                                            <span className="text-sm text-gray-500">
                                                {order.customer_name}
                                            </span>
                                        )}
                                    </span>
                                    <span className="flex items-center gap-3">
                                        <StatusBadge status={order.status} />
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
