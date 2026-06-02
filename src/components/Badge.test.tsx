import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge, StatusBadge, type Tone } from "./Badge";

describe("Badge", () => {
    it("renders children with the tone's classes", () => {
        render(<Badge tone="success">Released</Badge>);
        expect(screen.getByText("Released")).toHaveClass("bg-green-100", "rounded-full");
    });

    it("defaults to the neutral tone", () => {
        render(<Badge>Plain</Badge>);
        expect(screen.getByText("Plain")).toHaveClass("bg-gray-100");
    });
});

describe("StatusBadge", () => {
    const tones: Record<string, Tone> = { DRAFT: "warning", RELEASED: "success" };

    it("maps a known value to its tone", () => {
        render(<StatusBadge value="RELEASED" tones={tones} />);
        expect(screen.getByText("RELEASED")).toHaveClass("bg-green-100");
    });

    it("uses the fallback tone for an unmapped value", () => {
        render(<StatusBadge value="MYSTERY" tones={tones} fallback="danger" />);
        expect(screen.getByText("MYSTERY")).toHaveClass("bg-red-100");
    });

    it("renders a custom label instead of the raw value", () => {
        render(<StatusBadge value="RELEASED" tones={tones} label="Live" />);
        expect(screen.getByText("Live")).toHaveClass("bg-green-100");
    });
});
