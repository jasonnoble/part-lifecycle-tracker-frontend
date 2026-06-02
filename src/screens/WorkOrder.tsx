import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, apiList, ApiError } from "../apiClient";
import { getRole, type RoleKey } from "../roles";
import type { BomItem } from "../api/types";
import { StatusBadge, type Tone } from "../components/Badge";

// ---------------------------------------------------------------------------
// Types (work-order / step shapes are screen-specific — kept local)
// ---------------------------------------------------------------------------
// Server step status enum. NOTE: per the API spec the authoritative enum is
// PENDING | INSTALLED | VALIDATED | CERTIFIED and "BLOCKED" is a DERIVED UI
// concept (see deriveBlocked below). The live backend currently also emits a
// "BLOCKED" string for steps whose prerequisite isn't certified yet, so we
// accept it defensively but never rely on it — we derive blocking ourselves.
type ServerStepStatus = "PENDING" | "INSTALLED" | "VALIDATED" | "CERTIFIED";

type WorkOrderStep = {
    id: string;
    bomItemId: string;
    status: ServerStepStatus | "BLOCKED";
    installedPartInstanceId: string | null;
    installedActor: string | null;
    validatedActor: string | null;
    certifiedActor: string | null;
    childPartNumber: string;
    childPartName: string;
    installedAt: string | null;
    validatedAt: string | null;
    certifiedAt: string | null;
};

type WorkOrder = {
    id: string;
    status: string;
    customerOrderLineId: string | null;
    partNumber: string;
    serialNumber: string;
    steps: WorkOrderStep[];
    createdAt: string;
    updatedAt: string;
};

// BOM dependency graph (from GET /parts/{partNumber}/bom). Used to derive which
// PENDING steps are blocked by an uncertified prerequisite. `BomItem` comes
// from the shared API types.
type BomResponse = { data: BomItem[] };

// ---------------------------------------------------------------------------
// Role -> actor email mapping
//   The `actor` field is an EMAIL, not a role key or person name.
//   Known from the spec examples:
//     TECH_1 -> jamie@factory.com (installer)
//     TECH_2 -> riley@factory.com (validator)
//     QA     -> quinn@factory.com (certifier; has the QA role server-side)
//   Other roles are best-guess derived emails (they can't perform step
//   actions anyway, but we provide a stable value).
// ---------------------------------------------------------------------------
const ROLE_ACTOR_EMAIL: Record<RoleKey, string> = {
    TECH_1: "jamie@factory.com",
    TECH_2: "riley@factory.com",
    QA: "quinn@factory.com",
    // best-guess (not used for install/validate/certify):
    SALESPERSON: "sarah@factory.com",
    FLOOR_MANAGER: "marcus@factory.com",
    SITE_MANAGER: "alex@factory.com",
};

function actorEmailForRole(role: RoleKey): string {
    return ROLE_ACTOR_EMAIL[role];
}

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
// Status pill tones (shared Badge component)
// ---------------------------------------------------------------------------
const STATUS_TONES: Record<string, Tone> = {
    PENDING: "neutral",
    INSTALLED: "info",
    VALIDATED: "warning",
    CERTIFIED: "success",
    BLOCKED: "danger",
};

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function WorkOrder() {
    const queryClient = useQueryClient();
    const currentRole = getRole();
    const actorEmail = actorEmailForRole(currentRole);

    // No id in the route (this is the index / Assembly Line tab), so fetch the
    // OPEN work orders and treat the first one as the active work order.
    const { isPending, error, data } = useQuery({
        queryKey: ["work-orders"],
        queryFn: () => apiList<WorkOrder>("/work-orders?status=OPEN"),
    });

    const workOrder = data?.[0];

    // Fetch the parent part's BOM so we can derive blocked steps. Enabled only
    // once we know the work order's partNumber.
    const partNumber = workOrder?.partNumber;
    const { data: bomData } = useQuery({
        queryKey: ["bom", partNumber],
        queryFn: () => api<BomResponse>(`/parts/${partNumber}/bom`),
        enabled: !!partNumber,
    });
    const bomItems = bomData?.data ?? [];

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

    const workOrderId = workOrder?.id;

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
            if (!workOrderId) throw new Error("No active work order.");
            return api<WorkOrder>(
                `/work-orders/${workOrderId}/steps/${stepId}/${action}`,
                { method: "POST", body: JSON.stringify(body) },
            );
        },
        onSuccess: (_data, vars) => {
            setStepError(vars.stepId, null);
            queryClient.invalidateQueries({ queryKey: ["work-orders"] });
        },
        onError: (err: unknown, vars) => {
            setStepError(vars.stepId, errorMessage(err));
        },
    });

    const completeMutation = useMutation({
        mutationFn: () => {
            if (!workOrderId) throw new Error("No active work order.");
            return api<WorkOrder>(`/work-orders/${workOrderId}/complete`, {
                method: "POST",
                body: JSON.stringify({}),
            });
        },
        onSuccess: () => {
            setStepError("complete", null);
            queryClient.invalidateQueries({ queryKey: ["work-orders"] });
        },
        onError: (err: unknown) => {
            setStepError("complete", errorMessage(err));
        },
    });

    if (isPending) return <p className="p-4">Loading…</p>;
    if (error)
        return <p className="p-4 text-red-600">Error: {error.message}</p>;
    if (!workOrder)
        return <p className="p-4 text-gray-600">No active work order.</p>;

    const steps = workOrder.steps ?? [];
    const allCertified =
        steps.length > 0 && steps.every((s) => s.status === "CERTIFIED");

    function runAction(step: WorkOrderStep, action: Action) {
        const body: Record<string, unknown> = { actor: actorEmail };
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
        <section className="mx-auto max-w-3xl p-4">
            <div className="mb-4 flex items-baseline justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">
                        Work Order {workOrder.serialNumber}
                    </h1>
                    <p className="text-sm text-gray-500">
                        {workOrder.partNumber} · {workOrder.status}
                    </p>
                </div>
                <span className="text-sm text-gray-500">
                    Acting as {actorEmail}
                </span>
            </div>

            <ul className="space-y-2">
                {steps.map((step) => (
                    <StepRow
                        key={step.id}
                        step={step}
                        blocked={deriveBlocked(step, steps, bomItems)}
                        currentRole={currentRole}
                        actorEmail={actorEmail}
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
    currentRole,
    actorEmail,
    serial,
    onSerialChange,
    error,
    pending,
    onAction,
}: {
    step: WorkOrderStep;
    blocked: Blocked | null;
    currentRole: RoleKey;
    actorEmail: string;
    serial: string;
    onSerialChange: (value: string) => void;
    error?: string;
    pending: boolean;
    onAction: (action: Action) => void;
}) {
    const action = actionForStatus(step.status);
    const isBlocked = !!blocked;

    // 4-eyes: the installer of a step cannot also validate it. The server
    // enforces this too; we mirror it in the UI by disabling Validate.
    const fourEyesViolation =
        action === "validate" && step.installedActor === actorEmail;

    // Certify is QA-only.
    const certifyNotQa = action === "certify" && currentRole !== "QA";

    const canAct =
        action != null &&
        !isBlocked &&
        !fourEyesViolation &&
        !certifyNotQa &&
        !pending;

    // Display status: show derived BLOCKED for a blocked pending step.
    const displayStatus = isBlocked ? "BLOCKED" : step.status;

    let actionTitle: string | undefined;
    if (isBlocked)
        actionTitle = `Blocked by ${blocked.blockingPartName} (must be CERTIFIED first)`;
    else if (fourEyesViolation)
        actionTitle = "4-eyes: you installed this step and cannot validate it";
    else if (certifyNotQa) actionTitle = "Certify requires the QA role";

    return (
        <li className="rounded-lg border border-gray-200 p-3">
            <div className="flex items-center justify-between gap-4">
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

                <div className="flex shrink-0 items-center gap-3">
                    <StatusBadge value={displayStatus} tones={STATUS_TONES} />
                    {action === "install" && !isBlocked && (
                        <input
                            type="text"
                            value={serial}
                            onChange={(e) => onSerialChange(e.target.value)}
                            placeholder="Serial #"
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
