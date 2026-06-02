import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { api, apiList } from "../apiClient";
import type { Part } from "../api/types";
import { StatusBadge, type Tone } from "../components/Badge";

const STATUS_TONES: Record<string, Tone> = {
  DRAFT: "warning",
  RELEASED: "success",
  OBSOLETE: "neutral",
};

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
  partNumber: string;
  name: string;
  description: string;
  revision: string;
};

const EMPTY_FORM: NewPartForm = {
  partNumber: "",
  name: "",
  description: "",
  revision: "",
};

function CreatePartForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<NewPartForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof NewPartForm, string>>>({});

  // Close on Escape — a standard dialog affordance.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const mutation = useMutation({
    mutationFn: (body: NewPartForm) =>
      api<Part>("/parts", {
        method: "POST",
        // The backend contract is snake_case; map at the API boundary.
        body: JSON.stringify({
          part_number: body.partNumber.trim(),
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
    if (!form.partNumber.trim()) next.partNumber = "Part number is required.";
    if (!form.name.trim()) next.name = "Name is required.";
    if (!form.description.trim()) next.description = "Description is required.";
    if (!form.revision.trim()) next.revision = "Revision is required.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validate()) return;
    mutation.mutate(form);
  }

  function update(field: keyof NewPartForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  return (
    <div
      className="fixed inset-0 z-10 flex items-start justify-center bg-black/30 p-4 pt-24"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-part-heading"
        className="w-full max-w-md space-y-4 rounded-lg bg-white p-6 shadow-xl"
      >
        <h2 id="new-part-heading" className="text-lg font-semibold text-gray-900">
          New Part
        </h2>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Part number <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            autoFocus
            value={form.partNumber}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              update("partNumber", e.target.value)
            }
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {errors.partNumber && (
            <p className="mt-1 text-xs text-red-600">{errors.partNumber}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              update("name", e.target.value)
            }
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
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
              update("description", e.target.value)
            }
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
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              update("revision", e.target.value)
            }
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {errors.revision && (
            <p className="mt-1 text-xs text-red-600">{errors.revision}</p>
          )}
        </div>

        {mutation.error && (
          <p role="alert" className="text-sm text-red-600">
            Could not create part: {mutation.error.message}
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
      return apiList<Part>(`/parts${qs}`);
    },
  });

  const parts = data ?? [];

  return (
    <div>
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
        onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
        aria-label="Search parts"
        placeholder="Search by name or part number…"
        className="mb-4 w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />

      {isPending && <p className="text-gray-500">Loading…</p>}
      {error && (
        <p role="alert" className="text-red-600">
          Error: {error.message}
        </p>
      )}

      {!isPending && !error && (
        <p className="mb-2 text-sm text-gray-500">
          {parts.length} {parts.length === 1 ? "part" : "parts"}
          {debouncedSearch.trim() && ` matching “${debouncedSearch.trim()}”`}
        </p>
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
              {parts.map((p) => {
                const goToPart = () =>
                  navigate(`/parts/${encodeURIComponent(p.partNumber)}`);
                return (
                <tr
                  key={p.id}
                  onClick={goToPart}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      goToPart();
                    }
                  }}
                  role="link"
                  tabIndex={0}
                  aria-label={`View part ${p.partNumber}, ${p.name}`}
                  className="cursor-pointer hover:bg-gray-50 focus:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
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
                    <StatusBadge value={p.status} tones={STATUS_TONES} />
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && <CreatePartForm onClose={() => setShowCreate(false)} />}
    </div>
  );
}
