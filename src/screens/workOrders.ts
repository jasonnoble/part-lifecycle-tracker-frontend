// Shared work-order types + status tones for the Assembly Line screens
// (WorkOrdersList + WorkOrderDetail). Kept in a plain module so both can import
// the runtime `STEP_STATUS_TONES` without tripping react-refresh's
// "components-only export" rule.
import type { Tone } from "../components/Badge";

// Server step status enum. NOTE: per the API spec the authoritative enum is
// PENDING | INSTALLED | VALIDATED | CERTIFIED and "BLOCKED" is a DERIVED UI
// concept (see deriveBlocked in WorkOrderDetail). The live backend currently
// also emits a "BLOCKED" string for steps whose prerequisite isn't certified
// yet, so we accept it defensively but never rely on it — we derive blocking
// ourselves.
export type ServerStepStatus = "PENDING" | "INSTALLED" | "VALIDATED" | "CERTIFIED";

export type WorkOrderStep = {
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

export type WorkOrder = {
  id: string;
  status: string;
  customerOrderLineId: string | null;
  partNumber: string;
  serialNumber: string;
  steps: WorkOrderStep[];
  createdAt: string;
  updatedAt: string;
};

// Step status pill tones (shared Badge component).
export const STEP_STATUS_TONES: Record<string, Tone> = {
  PENDING: "neutral",
  INSTALLED: "info",
  VALIDATED: "warning",
  CERTIFIED: "success",
  BLOCKED: "danger",
};
