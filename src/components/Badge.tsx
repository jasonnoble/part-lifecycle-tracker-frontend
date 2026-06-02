import type { ReactNode } from "react";

export type Tone = "success" | "warning" | "danger" | "neutral" | "info";

const TONE_CLASSES: Record<Tone, string> = {
    success: "bg-green-100 text-green-800 ring-green-600/20",
    warning: "bg-amber-100 text-amber-800 ring-amber-600/20",
    danger: "bg-red-100 text-red-800 ring-red-600/20",
    neutral: "bg-gray-100 text-gray-700 ring-gray-500/20",
    info: "bg-blue-100 text-blue-800 ring-blue-600/20",
};

const BASE_CLASSES =
    "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset";

/** A colored pill. */
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
    return <span className={`${BASE_CLASSES} ${TONE_CLASSES[tone]}`}>{children}</span>;
}

/**
 * Status pill that maps a string value to a {@link Tone}. Unmapped values use
 * `fallback` (default `neutral`); the label defaults to the value itself.
 */
export function StatusBadge({
    value,
    tones,
    fallback = "neutral",
    label,
}: {
    value: string;
    tones: Record<string, Tone>;
    fallback?: Tone;
    label?: ReactNode;
}) {
    return <Badge tone={tones[value] ?? fallback}>{label ?? value}</Badge>;
}
