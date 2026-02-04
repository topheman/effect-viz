import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { InfoModal } from "./InfoModal";

describe("InfoModal", () => {
  it("renders the info button", () => {
    render(<InfoModal />);

    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
  });

  it("opens the modal when clicking the info button", async () => {
    const user = userEvent.setup();
    render(<InfoModal />);

    const button = screen.getByRole("button");
    await user.click(button);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByText(import.meta.env.VITE_SHORT_TITLE),
    ).toBeInTheDocument();
    expect(
      screen.getByText(import.meta.env.VITE_DESCRIPTION),
    ).toBeInTheDocument();
  });

  it("displays the GitHub link in the modal", async () => {
    const user = userEvent.setup();
    render(<InfoModal />);

    await user.click(screen.getByRole("button"));

    const githubLink = screen.getByRole("link", { name: /view on github/i });
    expect(githubLink).toBeInTheDocument();
    expect(githubLink).toHaveAttribute(
      "href",
      "https://github.com/topheman/effect-viz",
    );
    expect(githubLink).toHaveAttribute("target", "_blank");
  });

  it("renders a QR code in the modal", async () => {
    const user = userEvent.setup();
    render(<InfoModal />);

    await user.click(screen.getByRole("button"));

    // QRCodeSVG renders inside the dialog - check for the QR code container
    const dialog = screen.getByRole("dialog");
    const qrCodeContainer = within(dialog).getByTestId("qrcode-container");
    expect(qrCodeContainer).toBeInTheDocument();
  });

  it("displays the About the project content in the modal", async () => {
    const user = userEvent.setup();
    render(<InfoModal />);

    await user.click(screen.getByRole("button"));

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByLabelText("About the project"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Effect runtime visualizer/i),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/This is v1/i)).toBeInTheDocument();
  });

  it("closes the modal when clicking the close button", async () => {
    const user = userEvent.setup();
    render(<InfoModal />);

    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    const closeButton = screen.getByRole("button", { name: /close/i });
    await user.click(closeButton);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
