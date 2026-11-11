import { expect, openApp, test } from "./utils";

test("the panels open at their default proportions", async ({ page }) => {
  await openApp(page);
  await expect(
    page.getByRole("separator", { name: "Resize editor and visualizer" }),
  ).toHaveAttribute("aria-valuenow", "40");
  await expect(
    page.getByRole("separator", { name: "Resize timeline" }),
  ).toHaveAttribute("aria-valuenow", "65");
});

test("dragging where two handles meet resizes both", async ({ page }) => {
  await openApp(page);
  const columns = page.getByRole("separator", {
    name: "Resize fiber tree and execution log",
  });
  const rows = page.getByRole("separator", { name: "Resize timeline" });
  const columnsBox = await columns.boundingBox();
  const rowsBox = await rows.boundingBox();
  if (!columnsBox || !rowsBox) throw new Error("handles not laid out");
  const columnsBefore = await columns.getAttribute("aria-valuenow");
  const rowsBefore = await rows.getAttribute("aria-valuenow");

  // The Timeline handle's grip, which sits on the columns line at a 50/50 split.
  const x = columnsBox.x + columnsBox.width / 2;
  const y = rowsBox.y + rowsBox.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 80, y + 60, { steps: 10 });
  await page.mouse.up();

  await expect(columns).not.toHaveAttribute(
    "aria-valuenow",
    columnsBefore ?? "",
  );
  await expect(rows).not.toHaveAttribute("aria-valuenow", rowsBefore ?? "");
});
