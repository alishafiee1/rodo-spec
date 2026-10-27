import { createBdd } from 'playwright-bdd';
const { Given, When, Then } = createBdd();

Given('مشتری صفحهٔ محصولات را باز کرده', async ({ page }) => {
  await page.goto('/');
});
When('روی «افزودن به سبد» برای {string} می‌زند', async ({ page }, name) => {
  await page.getByRole('listitem').filter({ hasText: name }).getByRole('button', { name: 'افزودن به سبد' }).click();
});
Then('جمع سبد {string} نشان داده می‌شود', async ({ page }, total) => {
  await page.getByTestId('cart-total').getByText(total).waitFor();
});
