// Cart (cycle 001). Discount support is added in cycle 002.
export function cartTotal(items) {
  return items.reduce((sum, i) => sum + i.price * i.qty, 0);
}
