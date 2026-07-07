import { expect, type Page } from "@playwright/test";

export async function selectComboboxValue(
  page: Page,
  name: string,
  value: string,
): Promise<void> {
  const combobox = page.locator(`input[role="combobox"][name="${name}"]`);
  await expect(combobox).toBeVisible({ timeout: 5_000 });
  await combobox.click();
  await combobox.fill(value);
  await combobox.press("Enter");
  await expect(combobox).not.toHaveValue("", { timeout: 3_000 });
}

export async function selectComboboxValueIfVisible(
  page: Page,
  name: string,
  value: string,
): Promise<boolean> {
  const combobox = page.locator(`input[role="combobox"][name="${name}"]`);
  if (!(await combobox.isVisible({ timeout: 3_000 }).catch(() => false))) {
    return false;
  }
  await selectComboboxValue(page, name, value);
  return true;
}
