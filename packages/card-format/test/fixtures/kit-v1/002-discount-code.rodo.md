---
schemaVersion: 1
id: "clx9n4c5d0002gm01discnt2"
boardId: "clx9jz1ab0000gm00board001"
title: "002 — کد تخفیف در سبد خرید"
status: in_progress
priority: medium
members: [sara]
startAt: 2026-10-06
dueAt: 2026-10-12
---

مشتری در صفحهٔ سبد یک کد تخفیف وارد می‌کند و مبلغ نهایی را با تخفیف می‌بیند.

## Progress notes

- Updated: 2026-10-08
- Done: فهرست کدها و تابع applyDiscount با تست واحد
- Remaining: کادر کد تخفیف در صفحهٔ سبد، step definitionها، تست پذیرش
- Blocker: none

## Refs

- [توضیح ساده](/rodo/cycles/002-discount-code/simple.md) <!-- rodo:ref_clx9n4r1 -->
- [سند فنی](/rodo/cycles/002-discount-code/spec.md) <!-- rodo:ref_clx9n4r2 -->
- [سناریوهای پذیرش](/rodo/cycles/002-discount-code/acceptance.feature) <!-- rodo:ref_clx9n4r3 -->
- [محاسبهٔ جمع سبد](/src/cart.js) <!-- rodo:ref_clx9n4r4 -->
- [قاعدهٔ قیمت در معماری](/rodo/project/architecture.md#قواعدی-که-همه-باید-بدانند) <!-- rodo:ref_clx9n4r5 -->

## Checklist: قدم‌ها <!-- rodo:chk_clx9n4c1 -->

- [x] تأیید کاربر: simple.md و سناریوها [approval] <!-- rodo:ckl_clx9n4i1 -->
- [x] فهرست کدها و کد نمونهٔ MARYAM10 طبق spec.md بخش ۲ @sara [hours: 0:40] <!-- rodo:ckl_clx9n4i2 -->
- [x] تابع applyDiscount و تست واحدش طبق spec.md بخش ۳ @sara [hours: 1:50] <!-- rodo:ckl_clx9n4i3 -->
- [ ] کادر «کد تخفیف» و خط «مبلغ نهایی» در صفحهٔ سبد طبق spec.md بخش ۴ @sara <!-- rodo:ckl_clx9n4i4 -->
- [ ] step definitionهای acceptance.feature @sara <!-- rodo:ckl_clx9n4i5 -->
- [ ] تست پذیرش پاس شد @sara <!-- rodo:ckl_clx9n4i6 -->
