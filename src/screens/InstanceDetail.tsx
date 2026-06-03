import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { api, apiList, ApiError } from "../apiClient";
import { Badge, StatusBadge, type Tone } from "../components/Badge";
import { useAuth } from "../auth/AuthProvider";
import { useDocumentTitle } from "../useDocumentTitle";

type TestResult = "PASS" | "FAIL" | "INCONCLUSIVE";

// Lifecycle event types — must match PartInstance::STATUSES on the backend.
// Recording an event also advances the instance's current status to this value.
const EVENT_TYPES = [
  "ORDERED",
  "RECEIVED",
  "INSPECTED",
  "IN_ASSEMBLY",
  "INSTALLED",
  "VALIDATED",
  "CERTIFIED",
] as const;

const TEST_RESULTS: TestResult[] = ["PASS", "FAIL", "INCONCLUSIVE"];

// Surface a thrown value as a user-facing message, prefixing the server's
// `[code]` for ApiErrors (e.g. [VALIDATION_FAILED]).
function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    return `${err.code ? `[${err.code}] ` : ""}${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return "Request failed";
}

// Format a Date as the value a <input type="datetime-local"> expects
// ("YYYY-MM-DDTHH:mm", local time, no timezone).
function toDateTimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

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

const RESULT_TONES: Record<TestResult, Tone> = {
  PASS: "success",
  FAIL: "danger",
  INCONCLUSIVE: "neutral",
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

// Shared field styling.
const FIELD_CLASS =
  "rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

// --- Record lifecycle event form ----------------------------------------
// Appends to the (append-only) lifecycle log; the chosen eventType also
// becomes the instance's new current status (enforced server-side).

function RecordEventForm({
  serial,
  onClose,
}: {
  serial: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [eventType, setEventType] = useState<string>(EVENT_TYPES[0]);
  const [occurredAt, setOccurredAt] = useState(() =>
    toDateTimeLocalValue(new Date()),
  );
  const [notes, setNotes] = useState("");

  const record = useMutation({
    mutationFn: () =>
      api(`/instances/${serial}/events`, {
        method: "POST",
        // The actor is recorded server-side from the authenticated identity
        // (JAS-79) — it is no longer client-supplied.
        body: JSON.stringify({
          eventType,
          notes: notes.trim() || null,
          occurredAt: new Date(occurredAt).toISOString(),
        }),
      }),
    onSuccess: () => {
      // The event log changed AND the instance's current status advanced.
      queryClient.invalidateQueries({ queryKey: ["instance", serial, "events"] });
      queryClient.invalidateQueries({ queryKey: ["instance", serial] });
      onClose();
    },
  });

  const canSubmit = eventType !== "" && occurredAt !== "";

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    record.mutate();
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Record lifecycle event"
      className="rounded-lg border border-gray-200 bg-gray-50 p-4"
    >
      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col text-sm">
          <span className="mb-1 font-medium text-gray-700">Event type</span>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className={`${FIELD_CLASS} min-w-44`}
            required
          >
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col text-sm">
          <span className="mb-1 font-medium text-gray-700">Occurred at</span>
          <input
            type="datetime-local"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            className={FIELD_CLASS}
            required
          />
        </label>
      </div>

      <p className="mt-2 text-xs text-gray-400">
        Recorded as {user?.email ?? "your authenticated identity"} — the actor
        comes from your session.
      </p>

      <label className="mt-3 flex flex-col text-sm">
        <span className="mb-1 font-medium text-gray-700">
          Notes <span className="font-normal text-gray-400">(optional)</span>
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={FIELD_CLASS}
        />
      </label>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="submit"
          disabled={!canSubmit || record.isPending}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {record.isPending ? "Recording…" : "Record event"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          Cancel
        </button>
        {record.error && (
          <span className="text-sm text-red-600">
            {errorMessage(record.error)}
          </span>
        )}
      </div>
    </form>
  );
}

// --- Add test result form ------------------------------------------------

function AddTestRecordForm({
  serial,
  onClose,
}: {
  serial: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [testType, setTestType] = useState("");
  const [result, setResult] = useState<TestResult>("PASS");
  const [occurredAt, setOccurredAt] = useState(() =>
    toDateTimeLocalValue(new Date()),
  );
  const [notes, setNotes] = useState("");

  const record = useMutation({
    mutationFn: () =>
      api(`/instances/${serial}/tests`, {
        method: "POST",
        // conductedBy is recorded server-side from the authenticated identity
        // (JAS-79) — it is no longer client-supplied.
        body: JSON.stringify({
          testType: testType.trim(),
          result,
          notes: notes.trim() || null,
          occurredAt: new Date(occurredAt).toISOString(),
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instance", serial, "tests"] });
      onClose();
    },
  });

  const canSubmit = testType.trim() !== "" && occurredAt !== "";

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    record.mutate();
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Add test result"
      className="rounded-lg border border-gray-200 bg-gray-50 p-4"
    >
      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col text-sm">
          <span className="mb-1 font-medium text-gray-700">Test type</span>
          <input
            type="text"
            value={testType}
            onChange={(e) => setTestType(e.target.value)}
            placeholder="e.g. Pressure test"
            className={`${FIELD_CLASS} min-w-56`}
            required
          />
        </label>

        <label className="flex flex-col text-sm">
          <span className="mb-1 font-medium text-gray-700">Result</span>
          <select
            value={result}
            onChange={(e) => setResult(e.target.value as TestResult)}
            className={`${FIELD_CLASS} min-w-36`}
            required
          >
            {TEST_RESULTS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col text-sm">
          <span className="mb-1 font-medium text-gray-700">Occurred at</span>
          <input
            type="datetime-local"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            className={FIELD_CLASS}
            required
          />
        </label>
      </div>

      <p className="mt-2 text-xs text-gray-400">
        Conducted by {user?.email ?? "your authenticated identity"} — recorded
        from your session.
      </p>

      <label className="mt-3 flex flex-col text-sm">
        <span className="mb-1 font-medium text-gray-700">
          Notes <span className="font-normal text-gray-400">(optional)</span>
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={FIELD_CLASS}
        />
      </label>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="submit"
          disabled={!canSubmit || record.isPending}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {record.isPending ? "Saving…" : "Add test result"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          Cancel
        </button>
        {record.error && (
          <span className="text-sm text-red-600">
            {errorMessage(record.error)}
          </span>
        )}
      </div>
    </form>
  );
}

export default function InstanceDetail() {
  const { serial } = useParams<{ serial: string }>();
  useDocumentTitle(serial);
  const [showEventForm, setShowEventForm] = useState(false);
  const [showTestForm, setShowTestForm] = useState(false);

  const instanceQuery = useQuery({
    queryKey: ["instance", serial],
    queryFn: () => api<Instance>(`/instances/${serial}`),
    enabled: Boolean(serial),
  });

  const eventsQuery = useQuery({
    queryKey: ["instance", serial, "events"],
    queryFn: () => apiList<LifecycleEvent>(`/instances/${serial}/events`),
    enabled: Boolean(serial),
  });

  const testsQuery = useQuery({
    queryKey: ["instance", serial, "tests"],
    queryFn: () => apiList<TestRecord>(`/instances/${serial}/tests`),
    enabled: Boolean(serial),
  });

  // Events are returned ordered by occurred_at ASC; re-sort defensively.
  // Memoized above the early returns to keep hook order stable.
  const eventsData = eventsQuery.data;
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
    return <p className="text-gray-500">Loading…</p>;
  }
  if (instanceQuery.error) {
    return (
      <p className="text-red-600">
        Error: {instanceQuery.error.message}
      </p>
    );
  }

  const instance = instanceQuery.data;

  const testRecords = testsQuery.data ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
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
            <Badge tone="info">{instance.currentStatus}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Part:</span>
            <Link
              to={`/parts/${encodeURIComponent(instance.partNumber)}`}
              className="font-mono text-sm text-blue-600 hover:underline"
            >
              {instance.partNumber}
            </Link>
          </div>
        </div>
      </header>

      <section className="space-y-4" aria-labelledby="events-heading">
        <div className="flex items-center justify-between gap-4">
          <h2
            id="events-heading"
            className="text-lg font-semibold text-gray-900"
          >
            Lifecycle Events
          </h2>
          {serial && !showEventForm && (
            <button
              type="button"
              onClick={() => setShowEventForm(true)}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Record event
            </button>
          )}
        </div>
        {serial && showEventForm && (
          <RecordEventForm
            serial={serial}
            onClose={() => setShowEventForm(false)}
          />
        )}
        {eventsQuery.isPending ? (
          <p className="text-sm text-gray-500">Loading events…</p>
        ) : eventsQuery.error ? (
          <p className="text-sm text-red-600">
            Error: {eventsQuery.error.message}
          </p>
        ) : events.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
            No events recorded.
          </p>
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
        <div className="flex items-center justify-between gap-4">
          <h2
            id="tests-heading"
            className="text-lg font-semibold text-gray-900"
          >
            Test Records
          </h2>
          {serial && !showTestForm && (
            <button
              type="button"
              onClick={() => setShowTestForm(true)}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Add test result
            </button>
          )}
        </div>
        {serial && showTestForm && (
          <AddTestRecordForm
            serial={serial}
            onClose={() => setShowTestForm(false)}
          />
        )}
        {testsQuery.isPending ? (
          <p className="text-sm text-gray-500">Loading tests…</p>
        ) : testsQuery.error ? (
          <p className="text-sm text-red-600">
            Error: {testsQuery.error.message}
          </p>
        ) : testRecords.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
            No test records.
          </p>
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
                <StatusBadge
                  value={record.result}
                  tones={RESULT_TONES}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
