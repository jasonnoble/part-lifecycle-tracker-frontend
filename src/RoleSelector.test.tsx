import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import RoleSelector from "./RoleSelector";
import { getRole } from "./roles";

function clearActorRole() {
  document.cookie = "actor_role=; path=/; max-age=0";
}

afterEach(clearActorRole);

describe("RoleSelector", () => {
  it("persists the chosen role to the cookie and reflects it in the select", async () => {
    clearActorRole();
    const user = userEvent.setup();

    render(<RoleSelector />);

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    await user.selectOptions(select, "QA");

    // onChange writes the cookie (persist) and updates local state (re-render).
    expect(getRole()).toBe("QA");
    expect(select.value).toBe("QA");
  });
});
