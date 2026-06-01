import { useQuery } from "@tanstack/react-query";
import { api } from "../apiClient";

type Part = { id: string; part_number: string; name: string; status: string };

export default function PartsList() {
    const { isPending, error, data } = useQuery({
        queryKey: ["parts"],
        queryFn: () => api<{ data: Part[] }>("/parts"),  // adjust to the real response shape (pagy: { data, meta })
    });

    if (isPending) return <p>Loading…</p>;
    if (error) return <p>Error: {error.message}</p>;
    return (
        <ul>
            {data.data.map((p) => (
                <li key={p.id}>{p.part_number} — {p.name} ({p.status})</li>
            ))}
        </ul>
    );
}