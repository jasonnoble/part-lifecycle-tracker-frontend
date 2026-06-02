import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../apiClient";
import { getRole, ROLES, type RoleKey } from "../roles";

// ---------------------------------------------------------------------------
// Types (documented assumed API shapes — see PR body)
// ---------------------------------------------------------------------------
type StepStatus =
    | "PENDING"
    | "INSTALLED"
    | "VALIDATED"
    | "CERTIFIED"
    | "BLOCKED";

type WorkOrderStep = {
    id: string;
    part_number: string;
    name: string;
    status: StepStatus;
    blocked_reason?: string;
    blocking_part_name?: string;
    installed_by?: string;
    validated_by?: string;
};

type WorkOrder = {
    id: string;
    reference?: string;
    status: string;
    steps: WorkOrderStep[];
};

// The list endpoint uses the pagy-style envelope ({ data, meta }).
type WorkOrderListResponse = { data: WorkOrder[] };

// ---------------------------------------------------------------------------
// Role -> action mapping
//   PENDING   -> Install   (TECH_1 / Installer)
//   INSTALLED -> Validate  (TECH_2 / Validator)  [4-eyes: not the installer]
//   VALIDATED -> Certify   (QA)
// ---------------------------------------------------------------------------
type Action = "install" | "validate" | "certify";

const ACTION_ROLE: Record<Action, RoleKey> = {
    install: "TECH_1",
    validate: "TECH_2",
    certify: "QA",
};

const ACTION_LABEL: Record<Action, string> = {
    install: "Install",
    validate: "Validate",
    certify: "Certify",
};

// The action that advances a step from its current status.
function actionForStatus(status: StepStatus): Action | null {
    switch (status) {
        case "PENDING":
            return "install";
        case "INSTALLED":
            return "validate";
        case "VALIDATED":
            return "certify";
        default:
            return null; // CERTIFIED / BLOCKED have no advancing action
    }
}

function personForRole(role: RoleKey): string {
    return ROLES.find((r) => r.key === role)?.person ?? role;
}

// ---------------------------------------------------------------------------
// Status pill styling
// ---------------------------------------------------------------------------
const STATUS_STYLES: Record<StepStatus, string> = {
    PENDING: "bg-gray-100 text-gray-700 ring-gray-300",
    INSTALLED: "bg-blue-100 text-blue-800 ring-blue-300",
    VALIDATED: "bg-amber-100 text-amber-800 ring-amber-300",
    CERTIFIED: "bg-green-100 text-green-800 ring-green-300",
    BLOCKED: "bg-red-100 text-red-800 ring-red-300",
};

function StatusPill({ status }: { status: StepStatus }) {
    return (
        <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ring-1 ring-inset ${STATUS_STYLES[status]}`}
        >
            {status}
        </span>
    );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function WorkOrder() {
    const queryClient = useQueryClient();
    const currentRole = getRole();
    const currentPerson = personForRole(currentRole);

    // No id in the route (this is the index/home tab) so fetch the active /
    // first work order from the collection endpoint.
    const { isPending, error, data } = useQuery({
        queryKey: ["work_orders"],
        queryFn: () => api<WorkOrderListResponse>("/work_orders"),
    });

    const workOrder = data?.data?.[0];

    const stepMutation = useMutation({
        mutationFn: ({ stepId, action }: { stepId: string; action: Action }) =>
            api(`/work_orders/${workOrder!.id}/steps/${stepId}/${action}`, {
                method: "POST",
            }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["work_orders"] }),
    });

    const completeMutation = useMutation({
        mutationFn: () =>
            api(`/work_orders/${workOrder!.id}/complete`, { method: "POST" }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["work_orders"] }),
    });

    if (isPending) return <p className="p-4">Loading…</p>;
    if (error) return <p className="p-4 text-red-600">Error: {error.message}</p>;
    if (!workOrder)
        return <p className="p-4 text-gray-600">No active work order.</p>;

    const steps = workOrder.steps ?? [];
    const allCertified =
        steps.length > 0 && steps.every((s) => s.status === "CERTIFIED");

    return (
        <section className="mx-auto max-w-3xl p-4">
            <div className="mb-4 flex items-baseline justify-between">
                <h1 className="text-2xl font-bold text-gray-900">
                    Work Order {workOrder.reference ?? workOrder.id}
                </h1>
                <span className="text-sm text-gray-500">
                    Acting as {currentPerson}
                </span>
            </div>

            <ul className="space-y-2">
                {steps.map((step) => (
                    <StepRow
                        key={step.id}
                        step={step}
                        currentRole={currentRole}
                        currentPerson={currentPerson}
                        pending={stepMutation.isPending}
                        onAction={(action) =>
                            stepMutation.mutate({ stepId: step.id, action })
                        }
                    />
                ))}
            </ul>

            <div className="mt-6 flex items-center gap-3">
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
        </section>
    );
}

// ---------------------------------------------------------------------------
// Step row
// ---------------------------------------------------------------------------
function StepRow({
    step,
    currentRole,
    currentPerson,
    pending,
    onAction,
}: {
    step: WorkOrderStep;
    currentRole: RoleKey;
    currentPerson: string;
    pending: boolean;
    onAction: (action: Action) => void;
}) {
    const action = actionForStatus(step.status);

    // Whether the current role is the one allowed to perform this action.
    const roleAllowed = action != null && ACTION_ROLE[action] === currentRole;

    // 4-eyes: the installer of a step cannot also validate it.
    const fourEyesViolation =
        action === "validate" && step.installed_by === currentPerson;

    const canAct = roleAllowed && !fourEyesViolation && !pending;

    return (
        <li className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 p-3">
            <div className="min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-gray-500">
                        {step.part_number}
                    </span>
                    <span className="font-medium text-gray-900">{step.name}</span>
                </div>
                {step.status === "BLOCKED" && (
                    <p className="mt-1 text-sm text-red-600">
                        Blocked
                        {step.blocking_part_name
                            ? ` by ${step.blocking_part_name}`
                            : ""}
                        {step.blocked_reason ? `: ${step.blocked_reason}` : ""}
                    </p>
                )}
                {step.installed_by && (
                    <p className="mt-0.5 text-xs text-gray-400">
                        Installed by {step.installed_by}
                        {step.validated_by
                            ? ` · Validated by ${step.validated_by}`
                            : ""}
                    </p>
                )}
            </div>

            <div className="flex shrink-0 items-center gap-3">
                <StatusPill status={step.status} />
                {action && (
                    <button
                        type="button"
                        disabled={!canAct}
                        onClick={() => onAction(action)}
                        title={
                            fourEyesViolation
                                ? "4-eyes: you installed this step and cannot validate it"
                                : !roleAllowed
                                  ? `Requires ${ACTION_ROLE[action]} role`
                                  : undefined
                        }
                        className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
                    >
                        {ACTION_LABEL[action]}
                    </button>
                )}
            </div>
        </li>
    );
}
