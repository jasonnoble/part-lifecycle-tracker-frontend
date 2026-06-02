import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { apiList } from "../apiClient";
import { StatusBadge, type Tone } from "../components/Badge";
import { useDocumentTitle } from "../useDocumentTitle";
import { STEP_STATUS_TONES, type WorkOrder } from "./workOrders";

// Work-order (not step) status tones.
const WO_STATUS_TONES: Record<string, Tone> = {
  OPEN: "info",
  BLOCKED: "danger",
  COMPLETE: "success",
  COMPLETED: "success",
};

// Step statuses in assembly-lifecycle order, used to render summary pills in a
// stable, meaningful sequence regardless of how the API orders the steps.
const STEP_STATUS_ORDER = [
  "PENDING",
  "BLOCKED",
  "INSTALLED",
  "VALIDATED",
  "CERTIFIED",
] as const;

function summarizeSteps(steps: WorkOrder["steps"]): { status: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const step of steps) {
    counts.set(step.status, (counts.get(step.status) ?? 0) + 1);
  }
  // Emit known statuses in lifecycle order, then any unexpected ones as-is.
  const seen = new Set<string>();
  const ordered: { status: string; count: number }[] = [];
  for (const status of STEP_STATUS_ORDER) {
    const count = counts.get(status);
    if (count) {
      ordered.push({ status, count });
      seen.add(status);
    }
  }
  for (const [status, count] of counts) {
    if (!seen.has(status)) ordered.push({ status, count });
  }
  return ordered;
}

// Surface the demo-interesting work orders first: those with steps, then by
// most recently updated. Empty shells sink to the bottom.
function sortWorkOrders(orders: WorkOrder[]): WorkOrder[] {
  return [...orders].sort((a, b) => {
    const aHasSteps = a.steps.length > 0 ? 1 : 0;
    const bHasSteps = b.steps.length > 0 ? 1 : 0;
    if (aHasSteps !== bHasSteps) return bHasSteps - aHasSteps;
    return (
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  });
}

export default function WorkOrdersList() {
  useDocumentTitle("Assembly Line");
  const navigate = useNavigate();

  const { isPending, error, data } = useQuery({
    queryKey: ["work-orders"],
    queryFn: () => apiList<WorkOrder>("/work-orders"),
  });

  const workOrders = useMemo(() => sortWorkOrders(data ?? []), [data]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Assembly Line</h1>
        <p className="text-sm text-gray-500">
          Work orders on the floor. Select one to install, validate, and
          certify its steps.
        </p>
      </div>

      {isPending && <p className="text-gray-500">Loading…</p>}
      {error && (
        <p role="alert" className="text-red-600">
          Error: {error.message}
        </p>
      )}

      {!isPending && !error && (
        <>
          <p className="mb-2 text-sm text-gray-500">
            {workOrders.length}{" "}
            {workOrders.length === 1 ? "work order" : "work orders"}
          </p>
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Serial
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Part
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Steps
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {workOrders.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-6 text-center text-sm text-gray-500"
                    >
                      No work orders found.
                    </td>
                  </tr>
                )}
                {workOrders.map((wo) => {
                  const summary = summarizeSteps(wo.steps);
                  const goToWorkOrder = () => navigate(`/work-orders/${wo.id}`);
                  return (
                    <tr
                      key={wo.id}
                      onClick={goToWorkOrder}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          goToWorkOrder();
                        }
                      }}
                      role="link"
                      tabIndex={0}
                      aria-label={`Open work order ${wo.serialNumber}`}
                      className="cursor-pointer hover:bg-gray-50 focus:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                    >
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {wo.serialNumber}
                      </td>
                      <td className="px-4 py-3 font-mono text-sm text-gray-500">
                        {wo.partNumber}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <StatusBadge value={wo.status} tones={WO_STATUS_TONES} />
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {summary.length === 0 ? (
                          <span className="text-gray-400">No steps</span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {summary.map(({ status, count }) => (
                              <StatusBadge
                                key={status}
                                value={status}
                                tones={STEP_STATUS_TONES}
                                label={`${count} ${status}`}
                              />
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
