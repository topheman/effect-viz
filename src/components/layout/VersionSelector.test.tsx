import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { VersionLinks, VersionSelector } from "./VersionSelector";

describe("VersionSelector", () => {
  it("discloses the version links from a pill showing the build's version", async () => {
    const user = userEvent.setup();
    render(<VersionSelector />);
    const pill = screen.getByRole("button", {
      name: `Effect ${__EFFECT_VERSION__}`,
    });
    expect(pill).toHaveAttribute("aria-expanded", "false");
    expect(pill).not.toHaveAttribute("aria-haspopup");

    await user.click(pill);

    expect(pill).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Effect versions" }),
    ).toBeInTheDocument();
  });
});

describe("VersionLinks", () => {
  it.each([
    { current: 3, other: "Effect 4", url: "https://effect-viz.vercel.app" },
    { current: 4, other: "Effect 3", url: "https://effect-viz-v3.vercel.app" },
  ])(
    "on Effect $current, links to $other and marks Effect $current current",
    ({ current, other, url }) => {
      render(<VersionLinks currentMajor={current} />);

      expect(screen.getByRole("link", { name: other })).toHaveAttribute(
        "href",
        url,
      );
      expect(
        screen.queryByRole("link", { name: `Effect ${current}` }),
      ).not.toBeInTheDocument();
      expect(screen.getByText(`Effect ${current}`)).toHaveAttribute(
        "aria-current",
        "page",
      );
    },
  );
});
