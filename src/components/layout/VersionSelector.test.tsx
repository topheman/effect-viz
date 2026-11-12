import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { VersionSelector } from "./VersionSelector";

describe("VersionSelector", () => {
  it("shows the build's Effect version on the pill", () => {
    render(<VersionSelector />);

    expect(
      screen.getByRole("button", { name: `Effect ${__EFFECT_VERSION__}` }),
    ).toBeInTheDocument();
  });

  it("lists the other site as a link and marks this one current", async () => {
    const user = userEvent.setup();
    render(<VersionSelector />);

    await user.click(
      screen.getByRole("button", { name: `Effect ${__EFFECT_VERSION__}` }),
    );

    const nav = screen.getByRole("navigation", { name: "Effect versions" });
    expect(within(nav).getByRole("link", { name: "Effect 4" })).toHaveAttribute(
      "href",
      "https://effect-viz.vercel.app",
    );
    expect(
      within(nav).queryByRole("link", { name: "Effect 3" }),
    ).not.toBeInTheDocument();
    expect(within(nav).getByText("Effect 3")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
