# 001 — Product list and cart: technical spec

## 1. Summary

The home page shows `products`. The cart lives in `localStorage`.

## 2. Rules

- **R1** Every product is shown as a list item with its name, price and an «افزودن به سبد» button.
- **R2** Adding a product puts one unit in the cart; adding it again increases the quantity.
- **R3** The cart total is `sum(price * qty)`, shown in `data-testid="cart-total"` with Persian digits and thousands separators, e.g. «۱۵۰٬۰۰۰ تومان».

## 3. Data

`src/catalog.js`: array `products` with `id`, `name`, `price` (toman, integer).

## 4. Logic

`src/cart.js`: `cartTotal(items)`.

## 5. Files

- `src/catalog.js`, `src/cart.js`, `e2e/steps/catalog.steps.js`

## 6. Acceptance run

`npx bddgen --tags @cycle-001 && npx playwright test --grep @cycle-001` (the `testCommand` of `rodo/config.json`).

## Decisions

- Prices are stored as integer toman. Because rial and decimals caused mistakes in reports.
- The cart is kept only in the browser. Because most customers buy once.
