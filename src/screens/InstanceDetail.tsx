import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { api } from "../apiClient";

type TestResult = "PASS" | "FAIL" | "INCONCLUSIVE";

type Instance = {
    id: string;
    serialNumber: string;
    currentStatus: string;
    partNumber: string;
    createdAt: string;
    updatedAt: string;
};

type LifecycleEvent = {
    id: string;
    eventType: string;
    actor: string;
    notes: string | null;
    metadata: unknown;
    occurredAt: string;
    recordedAt: string;
};

type TestRecord = {
    id: string;
    testType: string;
    result: TestResult;
    notes: string | null;
    conductedBy: string;
    occurredAt: string;
    recordedAt: string;
};

type ListResponse<T> = { data: T[]; meta: unknown };

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

    const instanceQuery = useQuery({
        queryKey: ["instance", serial],
        queryFn: () => api<Instance>(`/instances/${serial}`),
        enabled: Boolean(serial),
    });

    const eventsQuery = useQuery({
        queryKey: ["instance", serial, "events"],
        queryFn: () =>
            api<ListResponse<LifecycleEvent>>(`/instances/${serial}/events`),
        enabled: Boolean(serial),
    });

    const testsQuery = useQuery({
        queryKey: ["instance", serial, "tests"],
        queryFn: () =>
            api<ListResponse<TestRecord>>(`/instances/${serial}/tests`),
        enabled: Boolean(serial),
    });

    // Events are returned ordered by occurred_at ASC; re-sort defensively.
    // Memoized above the early returns to keep hook order stable.
    const eventsData = eventsQuery.data?.data;
    const events = useMemo(
        () =>
            [...(eventsData ?? [])].sort(
                (a, b) =>
                    new Date(a.occurredAt).getTime() -
                    new Date(b.occurredAt).getTime(),
            ),
        [eventsData],
    );

    if (instanceQuery.isPending) {
        return <p className="p-6 text-gray-500">Loading…</p>;
    }
    if (instanceQuery.error) {
        return (
            <p className="p-6 text-red-600">
                Error: {instanceQuery.error.message}
            </p>
        );
    }

    const instance = instanceQuery.data;

    const testRecords = testsQuery.data?.data ?? [];

    return (
        <div className="mx-auto max-w-3xl space-y-8 p-6">
            <header className="space-y-1">
                <p className="text-sm font-medium uppercase tracking-wide text-gray-500">
                    Instance
                </p>
                <h1 className="font-mono text-2xl font-bold text-gray-900">
                    {instance.serialNumber}
                </h1>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">
                            Current status:
                        </span>
                        <span className="inline-flex items-center rounded-md bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800 ring-1 ring-inset ring-blue-600/20">
                            {instance.currentStatus}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">Part:</span>
                        <span className="font-mono text-sm text-gray-900">
                            {instance.partNumber}
                        </span>
                    </div>
                </div>
            </header>

            <section className="space-y-4" aria-labelledby="events-heading">
                <h2
                    id="events-heading"
                    className="text-lg font-semibold text-gray-900"
                >
                    Lifecycle Events
                </h2>
                {eventsQuery.isPending ? (
                    <p className="text-sm text-gray-500">Loading events…</p>
                ) : eventsQuery.error ? (
                    <p className="text-sm text-red-600">
                        Error: {eventsQuery.error.message}
                    </p>
                ) : events.length === 0 ? (
                    <p className="text-sm text-gray-500">No events recorded.</p>
                ) : (
                    <ol
                        aria-labelledby="events-heading"
                        className="relative space-y-6 border-l border-gray-200 pl-6"
                    >
                        {events.map((event) => (
                            <li key={event.id} className="relative">
                                <span className="absolute -left-[1.6875rem] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-blue-500" />
                                <div className="space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                                            {event.eventType}
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
                                            <dd>{formatTimestamp(event.occurredAt)}</dd>
                                        </div>
                                        <div className="flex gap-1">
                                            <dt className="font-medium">Recorded:</dt>
                                            <dd>{formatTimestamp(event.recordedAt)}</dd>
                                        </div>
                                    </dl>
                                </div>
                            </li>
                        ))}
                    </ol>
                )}
            </section>

            <section className="space-y-4" aria-labelledby="tests-heading">
                <h2
                    id="tests-heading"
                    className="text-lg font-semibold text-gray-900"
                >
                    Test Records
                </h2>
                {testsQuery.isPending ? (
                    <p className="text-sm text-gray-500">Loading tests…</p>
                ) : testsQuery.error ? (
                    <p className="text-sm text-red-600">
                        Error: {testsQuery.error.message}
                    </p>
                ) : testRecords.length === 0 ? (
                    <p className="text-sm text-gray-500">No test records.</p>
                ) : (
                    <ul aria-labelledby="tests-heading" className="space-y-3">
                        {testRecords.map((record) => (
                            <li
                                key={record.id}
                                className="flex items-start justify-between gap-4 rounded-lg border border-gray-200 p-4"
                            >
                                <div className="space-y-1">
                                    <p className="text-sm font-medium text-gray-900">
                                        {record.testType}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        Conducted by {record.conductedBy}
                                    </p>
                                    {record.notes ? (
                                        <p className="text-sm text-gray-700">
                                            {record.notes}
                                        </p>
                                    ) : null}
                                    <dl className="flex flex-wrap gap-x-6 gap-y-0.5 text-xs text-gray-500">
                                        <div className="flex gap-1">
                                            <dt className="font-medium">Occurred:</dt>
                                            <dd>
                                                {formatTimestamp(record.occurredAt)}
                                            </dd>
                                        </div>
                                        <div className="flex gap-1">
                                            <dt className="font-medium">Recorded:</dt>
                                            <dd>
                                                {formatTimestamp(record.recordedAt)}
                                            </dd>
                                        </div>
                                    </dl>
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
