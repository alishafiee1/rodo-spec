# 002 — Discount code in the cart: technical spec

## 1. Summary

Codes are defined in `src/discount.js`. The cart page takes a code and calls `applyDiscount`.

## 2. Rules

- **R1** A valid code takes its percent off the cart total: `discount = floor(total * percent / 100)`. Input is trimmed and upper-cased. Only one code per order; «حذف کد» removes it.
- **R2** The cart total must be at least `minOrder` (200,000 toman for MARYAM10; exactly 200,000 is accepted). Otherwise: «این کد برای سفارش‌های ۲۰۰٬۰۰۰ تومان و بیشتر است».
- **R3** Unknown code: «این کد معتبر نیست». Expired code (after `expiresAt`): «مهلت این کد تمام شده». Check order: exists, date, minimum.

## 3. Data

`codes`: array of `{ code, percent, minOrder, expiresAt }`. Sample: `MARYAM10`, 10 %, min 200,000, ends `2026-11-21` (end of Aban 1405).

## 4. Logic

`applyDiscount(total, input, today)` → `{ ok: true, discount, total }` or `{ ok: false, message }`.

## 5. Screens

Under the cart total: input labelled `کد تخفیف` and button `اعمال`. On success: `data-testid="discount"` «تخفیف: X تومان», `data-testid="final-total"` «مبلغ نهایی: Y تومان», and a `حذف کد` button. Errors in `role="alert"`.

## 6. Files

- `src/discount.js` (new)
- the cart page (the file that renders `cart-total`)
- `e2e/steps/discount.steps.js` (new)

## 7. Edge cases

- If the customer removes items after applying a code and the total drops below the minimum, the code is removed and the R2 message is shown.

## 8. Acceptance run

`testCommand` of `rodo/config.json` with `{NNN}` = `002`. Steps fix the browser clock with `page.clock.setFixedTime`.

## Decisions

- One discount code per order. Because Maryam does not want discounts to stack.
- Discounts are rounded down. Because prices are integer toman.
