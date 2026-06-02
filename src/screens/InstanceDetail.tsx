import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { api } from "../apiClient";

type TestResult = "PASS" | "FAIL" | "INCONCLUSIVE";

type LifecycleEvent = {
    id: string;
    type: string;
    actor: string;
    notes?: string | null;
    occurred_at: string;
    recorded_at: string;
};

type TestRecord = {
    id: string;
    result: TestResult;
    name?: string | null;
    notes?: string | null;
    occurred_at?: string | null;
    recorded_at?: string | null;
};

type Instance = {
    serial: string;
    status: string;
    events: LifecycleEvent[];
    test_records: TestRecord[];
};

const RESULT_STYLES: Record<TestResult, string> = {
    PASS: "bg-green-100 text-green-800 ring-green-600/20",
    FAIL: "bg-red-100 text-red-800 ring-red-600/20",
    INCONCLUSIVE: "bg-gray-100 text-gray-700 ring-gray-500/20",
};

function formatTimestamp(value?: string | null): string {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function ResultBadge({ result }: { result: TestResult }) {
    const style = RESULT_STYLES[result] ?? RESULT_STYLES.INCONCLUSIVE;
    return (
        <span
            className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset ${style}`}
        >
            {result}
        </span>
    );
}

export default function InstanceDetail() {
    const { serial } = useParams<{ serial: string }>();

    const { isPending, error, data } = useQuery({
        queryKey: ["instance", serial],
        queryFn: () => api<Instance>(`/instances/${serial}`),
        enabled: Boolean(serial),
    });

    if (isPending) return <p className="p-6 text-gray-500">Loading…</p>;
    if (error) return <p className="p-6 text-red-600">Error: {error.message}</p>;

    // Sort events by occurred_at ascending regardless of API order.
    const events = [...(data.events ?? [])].sort(
        (a, b) =>
            new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
    );
    const testRecords = data.test_records ?? [];

    return (
        <div className="mx-auto max-w-3xl space-y-8 p-6">
            <header className="space-y-1">
                <p className="text-sm font-medium uppercase tracking-wide text-gray-500">
                    Instance
                </p>
                <h1 className="font-mono text-2xl font-bold text-gray-900">
                    {data.serial}
                </h1>
                <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">Current status:</span>
                    <span className="inline-flex items-center rounded-md bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800 ring-1 ring-inset ring-blue-600/20">
                        {data.status}
                    </span>
                </div>
            </header>

            <section className="space-y-4">
                <h2 className="text-lg font-semibold text-gray-900">
                    Lifecycle Events
                </h2>
                {events.length === 0 ? (
                    <p className="text-sm text-gray-500">No events recorded.</p>
                ) : (
                    <ol className="relative space-y-6 border-l border-gray-200 pl-6">
                        {events.map((event) => (
                            <li key={event.id} className="relative">
                                <span className="absolute -left-[1.6875rem] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-blue-500" />
                                <div className="space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                                            {event.type}
                                        </span>
                                        <span className="text-sm font-medium text-gray-900">
                                            {event.actor}
                                        </span>
                                    </div>
                                    {event.notes ? (
                                        <p className="text-sm text-gray-700">
                                            {event.notes}
                                        </p>
                                    ) : null}
                                    <dl className="mt-1 flex flex-wrap gap-x-6 gap-y-0.5 text-xs text-gray-500">
                                        <div className="flex gap-1">
                                            <dt className="font-medium">Occurred:</dt>
                                            <dd>{formatTimestamp(event.occurred_at)}</dd>
                                        </div>
                                        <div className="flex gap-1">
                                            <dt className="font-medium">Recorded:</dt>
                                            <dd>{formatTimestamp(event.recorded_at)}</dd>
                                        </div>
                                    </dl>
                                </div>
                            </li>
                        ))}
                    </ol>
                )}
            </section>

            <section className="space-y-4">
                <h2 className="text-lg font-semibold text-gray-900">Test Records</h2>
                {testRecords.length === 0 ? (
                    <p className="text-sm text-gray-500">No test records.</p>
                ) : (
                    <ul className="space-y-3">
                        {testRecords.map((record) => (
                            <li
                                key={record.id}
                                className="flex items-start justify-between gap-4 rounded-lg border border-gray-200 p-4"
                            >
                                <div className="space-y-1">
                                    <p className="text-sm font-medium text-gray-900">
                                        {record.name ?? "Test"}
                                    </p>
                                    {record.notes ? (
                                        <p className="text-sm text-gray-700">
                                            {record.notes}
                                        </p>
                                    ) : null}
                                    {record.occurred_at || record.recorded_at ? (
                                        <dl className="flex flex-wrap gap-x-6 gap-y-0.5 text-xs text-gray-500">
                                            <div className="flex gap-1">
                                                <dt className="font-medium">Occurred:</dt>
                                                <dd>
                                                    {formatTimestamp(record.occurred_at)}
                                                </dd>
                                            </div>
                                            <div className="flex gap-1">
                                                <dt className="font-medium">Recorded:</dt>
                                                <dd>
                                                    {formatTimestamp(record.recorded_at)}
                                                </dd>
                                            </div>
                                        </dl>
                                    ) : null}
                                </div>
                                <ResultBadge result={record.result} />
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
