// Discount codes (cycle 002, in progress).
export const codes = [{ code: 'MARYAM10', percent: 10, minOrder: 200000, expiresAt: '2026-11-21' }];

export function applyDiscount(total, input, today) {
  const c = codes.find((x) => x.code === String(input).trim().toUpperCase());
  if (!c) return { ok: false, message: 'این کد معتبر نیست' };
  if (today > c.expiresAt) return { ok: false, message: 'مهلت این کد تمام شده' };
  if (total < c.minOrder) return { ok: false, message: 'این کد برای سفارش‌های ۲۰۰٬۰۰۰ تومان و بیشتر است' };
  const discount = Math.floor((total * c.percent) / 100);
  return { ok: true, discount, total: total - discount };
}
