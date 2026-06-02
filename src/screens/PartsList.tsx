import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { api } from "../apiClient";

type Part = {
    id: string;
    partNumber: string;
    name: string;
    description: string;
    revision: string | null;
    status: string;
    createdAt: string;
    updatedAt: string;
};

type PartsEnvelope = { data: Part[]; meta?: unknown };

const STATUS_STYLES: Record<string, string> = {
    DRAFT: "bg-amber-100 text-amber-800 ring-amber-600/20",
    RELEASED: "bg-green-100 text-green-800 ring-green-600/20",
    OBSOLETE: "bg-gray-200 text-gray-700 ring-gray-500/20",
};

function StatusBadge({ status }: { status: string }) {
    const style =
        STATUS_STYLES[status?.toUpperCase()] ??
        "bg-blue-100 text-blue-800 ring-blue-600/20";
    return (
        <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${style}`}
        >
            {status}
        </span>
    );
}

/** Debounce a fast-changing value (e.g. a search box) by `delay` ms. */
function useDebounced<T>(value: T, delay = 250): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const id = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(id);
    }, [value, delay]);
    return debounced;
}

type NewPartForm = {
    part_number: string;
    name: string;
    description: string;
    revision: string;
};

const EMPTY_FORM: NewPartForm = {
    part_number: "",
    name: "",
    description: "",
    revision: "",
};

function CreatePartForm({ onClose }: { onClose: () => void }) {
    const queryClient = useQueryClient();
    const [form, setForm] = useState<NewPartForm>(EMPTY_FORM);
    const [errors, setErrors] = useState<Partial<Record<keyof NewPartForm, string>>>({});

    const mutation = useMutation({
        mutationFn: (body: NewPartForm) =>
            api<Part>("/parts", {
                method: "POST",
                body: JSON.stringify({
                    part_number: body.part_number.trim(),
                    name: body.name.trim(),
                    description: body.description.trim(),
                    revision: body.revision.trim(),
                }),
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["parts"] });
            onClose();
        },
    });

    function validate(): boolean {
        const next: Partial<Record<keyof NewPartForm, string>> = {};
        if (!form.part_number.trim()) next.part_number = "Part number is required.";
        if (!form.name.trim()) next.name = "Name is required.";
        if (!form.description.trim()) next.description = "Description is required.";
        if (!form.revision.trim()) next.revision = "Revision is required.";
        setErrors(next);
        return Object.keys(next).length === 0;
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!validate()) return;
        mutation.mutate(form);
    }

    function update(field: keyof NewPartForm, value: string) {
        setForm((f) => ({ ...f, [field]: value }));
    }

    return (
        <div className="fixed inset-0 z-10 flex items-start justify-center bg-black/30 p-4 pt-24">
            <form
                onSubmit={handleSubmit}
                className="w-full max-w-md space-y-4 rounded-lg bg-white p-6 shadow-xl"
            >
                <h2 className="text-lg font-semibold text-gray-900">New Part</h2>

                <div>
                    <label className="block text-sm font-medium text-gray-700">
                        Part number <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="text"
                        value={form.part_number}
                        onChange={(e) => update("part_number", e.target.value)}
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    {errors.part_number && (
                        <p className="mt-1 text-xs text-red-600">{errors.part_number}</p>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700">
                        Name <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="text"
                        value={form.name}
                        onChange={(e) => update("name", e.target.value)}
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    {errors.name && (
                        <p className="mt-1 text-xs text-red-600">{errors.name}</p>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700">
                        Description <span className="text-red-500">*</span>
                    </label>
                    <textarea
                        value={form.description}
                        onChange={(e) => update("description", e.target.value)}
                        rows={3}
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    {errors.description && (
                        <p className="mt-1 text-xs text-red-600">{errors.description}</p>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700">
                        Revision <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="text"
                        value={form.revision}
                        onChange={(e) => update("revision", e.target.value)}
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    {errors.revision && (
                        <p className="mt-1 text-xs text-red-600">{errors.revision}</p>
                    )}
                </div>

                {mutation.isError && (
                    <p className="text-sm text-red-600">
                        Could not create part: {(mutation.error as Error).message}
                    </p>
                )}

                <div className="flex justify-end gap-2 pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={mutation.isPending}
                        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                        {mutation.isPending ? "Creating…" : "Create"}
                    </button>
                </div>
            </form>
        </div>
    );
}

export default function PartsList() {
    const navigate = useNavigate();
    const [search, setSearch] = useState("");
    const [showCreate, setShowCreate] = useState(false);
    const debouncedSearch = useDebounced(search, 250);

    // Server-side search: the debounced term is sent as ?search= and the query
    // refetches whenever it changes (the term is part of the query key).
    const { isPending, error, data } = useQuery({
        queryKey: ["parts", debouncedSearch],
        queryFn: () => {
            const q = debouncedSearch.trim();
            const qs = q ? `?search=${encodeURIComponent(q)}` : "";
            return api<PartsEnvelope>(`/parts${qs}`);
        },
    });

    const parts = data?.data ?? [];

    return (
        <div className="p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
                <h1 className="text-2xl font-bold text-gray-900">Parts</h1>
                <button
                    type="button"
                    onClick={() => setShowCreate(true)}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                    New Part
                </button>
            </div>

            <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or part number…"
                className="mb-4 w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />

            {isPending && <p className="text-gray-500">Loading…</p>}
            {error && (
                <p className="text-red-600">Error: {(error as Error).message}</p>
            )}

            {!isPending && !error && (
                <div className="overflow-hidden rounded-lg border border-gray-200">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                    Part number
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                    Name
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                    Revision
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                    Status
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                            {parts.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={4}
                                        className="px-4 py-6 text-center text-sm text-gray-500"
                                    >
                                        No parts found.
                                    </td>
                                </tr>
                            )}
                            {parts.map((p) => (
                                <tr
                                    key={p.id}
                                    onClick={() =>
                                        navigate(`/parts/${encodeURIComponent(p.partNumber)}`)
                                    }
                                    className="cursor-pointer hover:bg-gray-50"
                                >
                                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                        {p.partNumber}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-700">
                                        {p.name}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-500">
                                        {p.revision ?? "—"}
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                        <StatusBadge status={p.status} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {showCreate && <CreatePartForm onClose={() => setShowCreate(false)} />}
        </div>
    );
}
