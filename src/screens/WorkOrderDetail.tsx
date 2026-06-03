import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { api, ApiError } from "../apiClient";
import { useAuth } from "../auth/AuthProvider";
import type { BomItem } from "../api/types";
import { StatusBadge } from "../components/Badge";
import { useDocumentTitle } from "../useDocumentTitle";
import {
  STEP_STATUS_TONES,
  type WorkOrder,
  type WorkOrderStep,
} from "./workOrders";

// BOM dependency graph (from GET /parts/{partNumber}/bom). Used to derive which
// PENDING steps are blocked by an uncertified prerequisite. `BomItem` comes
// from the shared API types.
type BomResponse = { data: BomItem[] };

// Format an unknown thrown value into a user-facing message, surfacing the
// server-provided `[code]` prefix for ApiErrors.
function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    return `${err.code ? `[${err.code}] ` : ""}${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return "Request failed";
}

// ---------------------------------------------------------------------------
// Derived "blocked" state
//   A PENDING step is blocked when one of its BOM dependencies
//   (prerequisiteBomItemId) maps to a step that is not yet CERTIFIED.
//   The blocking part name is that prerequisite step's childPartName.
// ---------------------------------------------------------------------------
type Blocked = { blocked: true; blockingPartName: string };

function deriveBlocked(
  step: WorkOrderStep,
  steps: WorkOrderStep[],
  bomItems: BomItem[],
): Blocked | null {
  // Only PENDING steps can be (un)blocked; once installed it's moot.
  if (step.status !== "PENDING" && step.status !== "BLOCKED") return null;

  const bomItem = bomItems.find((b) => b.id === step.bomItemId);
  if (!bomItem || bomItem.dependencies.length === 0) return null;

  for (const dep of bomItem.dependencies) {
    const prereqStep = steps.find((s) => s.bomItemId === dep.prerequisiteBomItemId);
    if (prereqStep && prereqStep.status !== "CERTIFIED") {
      return {
        blocked: true,
        blockingPartName: prereqStep.childPartName,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Step actions
// ---------------------------------------------------------------------------
type Action = "install" | "validate" | "certify";

const ACTION_LABEL: Record<Action, string> = {
  install: "Install",
  validate: "Validate",
  certify: "Certify",
};

// The action that advances a step from its current (server) status.
function actionForStatus(status: WorkOrderStep["status"]): Action | null {
  switch (status) {
    case "PENDING":
      return "install";
    case "INSTALLED":
      return "validate";
    case "VALIDATED":
      return "certify";
    default:
      return null; // CERTIFIED / BLOCKED have no directly-advancing action
  }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function WorkOrderDetail() {
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();
  // The actor is the authenticated user (JAS-79) — the backend records
  // identity from the session; nothing actor-ish is sent in request bodies.
  const { user } = useAuth();
  const userEmail = user?.email ?? null;
  const permissions = user?.permissions ?? [];

  // Fetch this specific work order by id. The detail endpoint returns the bare
  // work-order object (not the pagy list envelope).
  const { isPending, error, data: workOrder } = useQuery({
    queryKey: ["work-order", id],
    queryFn: () => api<WorkOrder>(`/work-orders/${id}`),
    enabled: Boolean(id),
  });

  // Fetch the parent part's BOM so we can derive blocked steps. Enabled only
  // once we know the work order's partNumber.
  const partNumber = workOrder?.partNumber;
  const { data: bomData } = useQuery({
    queryKey: ["bom", partNumber],
    queryFn: () => api<BomResponse>(`/parts/${partNumber}/bom`),
    enabled: !!partNumber,
  });
  const bomItems = bomData?.data ?? [];

  useDocumentTitle(
    workOrder ? `Work Order ${workOrder.serialNumber}` : "Work Order",
  );

  // installedSerial input state, keyed by step id.
  const [serials, setSerials] = useState<Record<string, string>>({});
  // Inline error message, keyed by step id (or "complete").
  const [errors, setErrors] = useState<Record<string, string>>({});

  function setStepError(key: string, message: string | null) {
    setErrors((prev) => {
      const next = { ...prev };
      if (message) next[key] = message;
      else delete next[key];
      return next;
    });
  }

  // Re-fetch this work order and refresh the Assembly Line list summaries.
  function invalidateWorkOrder() {
    queryClient.invalidateQueries({ queryKey: ["work-order", id] });
    queryClient.invalidateQueries({ queryKey: ["work-orders"] });
  }

  const stepMutation = useMutation({
    mutationFn: ({
      stepId,
      action,
      body,
    }: {
      stepId: string;
      action: Action;
      body: Record<string, unknown>;
    }) => {
      if (!id) throw new Error("No active work order.");
      return api<WorkOrder>(
        `/work-orders/${id}/steps/${stepId}/${action}`,
        { method: "POST", body: JSON.stringify(body) },
      );
    },
    onSuccess: (_data, vars) => {
      setStepError(vars.stepId, null);
      invalidateWorkOrder();
    },
    onError: (err: unknown, vars) => {
      setStepError(vars.stepId, errorMessage(err));
    },
  });

  const completeMutation = useMutation({
    mutationFn: () => {
      if (!id) throw new Error("No active work order.");
      return api<WorkOrder>(`/work-orders/${id}/complete`, {
        method: "POST",
        body: JSON.stringify({}),
      });
    },
    onSuccess: () => {
      setStepError("complete", null);
      invalidateWorkOrder();
    },
    onError: (err: unknown) => {
      setStepError("complete", errorMessage(err));
    },
  });

  if (isPending) return <p className="text-gray-500">Loading…</p>;
  if (error)
    return <p className="text-red-600">Error: {error.message}</p>;
  if (!workOrder)
    return <p className="text-gray-600">Work order not found.</p>;

  const steps = workOrder.steps ?? [];
  const allCertified =
    steps.length > 0 && steps.every((s) => s.status === "CERTIFIED");

  function runAction(step: WorkOrderStep, action: Action) {
    // The backend derives the actor from the authenticated session (JAS-79).
    const body: Record<string, unknown> = {};
    if (action === "install") {
      const installedSerial = (serials[step.id] ?? "").trim();
      if (!installedSerial) {
        setStepError(step.id, "Enter the serial number to install.");
        return;
      }
      body.installedSerial = installedSerial;
    }
    stepMutation.mutate({ stepId: step.id, action, body });
  }

  return (
    <section className="mx-auto max-w-3xl">
      <Link
        to="/"
        className="mb-4 inline-block text-sm text-blue-600 hover:underline"
      >
        ← Assembly Line
      </Link>

      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Work Order {workOrder.serialNumber}
          </h1>
          <p className="text-sm text-gray-500">
            {workOrder.partNumber} · {workOrder.status}
          </p>
        </div>
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600">
          Acting as {userEmail ?? "read-only session"}
        </span>
      </div>

      {steps.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
          <p className="text-sm font-medium text-gray-700">
            This work order has no assembly steps yet.
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Steps appear here once the bill of materials is expanded into
            installable components.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {steps.map((step) => (
            <StepRow
              key={step.id}
              step={step}
              blocked={deriveBlocked(step, steps, bomItems)}
              userEmail={userEmail}
              permissions={permissions}
              serial={serials[step.id] ?? ""}
              onSerialChange={(v) =>
                setSerials((prev) => ({ ...prev, [step.id]: v }))
              }
              error={errors[step.id]}
              pending={
                stepMutation.isPending &&
                stepMutation.variables?.stepId === step.id
              }
              onAction={(action) => runAction(step, action)}
            />
          ))}
        </ul>
      )}

      <div className="mt-6 flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={!allCertified || completeMutation.isPending}
            onClick={() => completeMutation.mutate()}
            className="rounded-md bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
          >
            Complete work order
          </button>
          {!allCertified && (
            <span className="text-sm text-gray-500">
              All steps must be CERTIFIED to complete.
            </span>
          )}
        </div>
        {errors.complete && (
          <p className="text-sm text-red-600">{errors.complete}</p>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Step row
// ---------------------------------------------------------------------------
function StepRow({
  step,
  blocked,
  userEmail,
  permissions,
  serial,
  onSerialChange,
  error,
  pending,
  onAction,
}: {
  step: WorkOrderStep;
  blocked: Blocked | null;
  userEmail: string | null;
  permissions: string[];
  serial: string;
  onSerialChange: (value: string) => void;
  error?: string;
  pending: boolean;
  onAction: (action: Action) => void;
}) {
  const action = actionForStatus(step.status);
  const isBlocked = !!blocked;

  // 4-eyes: the installer of a step cannot also validate it — an identity rule
  // on the authenticated user. The server enforces this too (409 SAME_ACTOR);
  // we mirror it in the UI by disabling Validate.
  const fourEyesViolation =
    action === "validate" &&
    userEmail !== null &&
    step.installedActor === userEmail;

  // Server-computed abilities from /me: certify is qa_engineer-only, and
  // read-only sessions (no seeded identity) hold no abilities at all.
  const notPermitted =
    action != null && !permissions.includes(`step.${action}`);

  const canAct =
    action != null &&
    !isBlocked &&
    !fourEyesViolation &&
    !notPermitted &&
    !pending;

  // Display status: show derived BLOCKED for a blocked pending step.
  const displayStatus = isBlocked ? "BLOCKED" : step.status;

  let actionTitle: string | undefined;
  if (isBlocked)
    actionTitle = `Blocked by ${blocked.blockingPartName} (must be CERTIFIED first)`;
  else if (fourEyesViolation)
    actionTitle = "4-eyes: you installed this step and cannot validate it";
  else if (notPermitted)
    actionTitle =
      action === "certify"
        ? "Certify requires the QA Engineer role"
        : "Your session is read-only";

  return (
    <li className="rounded-lg border border-gray-200 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-gray-500">
              {step.childPartNumber}
            </span>
            <span className="font-medium text-gray-900">
              {step.childPartName}
            </span>
          </div>
          {isBlocked && (
            <p className="mt-1 text-sm text-red-600">
              Blocked by {blocked.blockingPartName} (must be
              certified first)
            </p>
          )}
          {step.installedActor && (
            <p className="mt-0.5 text-xs text-gray-400">
              Installed by {step.installedActor}
              {step.validatedActor
                ? ` · Validated by ${step.validatedActor}`
                : ""}
              {step.certifiedActor
                ? ` · Certified by ${step.certifiedActor}`
                : ""}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <StatusBadge value={displayStatus} tones={STEP_STATUS_TONES} />
          {action === "install" && !isBlocked && (
            <input
              type="text"
              value={serial}
              onChange={(e) => onSerialChange(e.target.value)}
              placeholder="Serial #"
              aria-label={`Serial number to install for ${step.childPartName}`}
              className="w-36 rounded-md border border-gray-300 px-2 py-1 text-sm"
            />
          )}
          {action && (
            <button
              type="button"
              disabled={!canAct}
              onClick={() => onAction(action)}
              title={actionTitle}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
            >
              {ACTION_LABEL[action]}
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </li>
  );
}
