export type Lang = 'fa' | 'en';

const T: Record<string, { fa: string; en: string }> = {
  'resume.none': { fa: 'کارت فعالی پیدا نشد', en: 'no active card found' },
  'resume.several': { fa: 'چند کارت فعال هست؛ یکی را مشخص کنید', en: 'several active cards; name one' },
  'resume.never': { fa: 'این پروژه هنوز هیچ‌وقت sync نشده؛ rodo sync را اجرا کنید', en: 'this project has never been synced; run rodo sync' },
  'resume.stale': { fa: 'آخرین sync بیش از یک ساعت پیش بوده؛ rodo sync را اجرا کنید', en: 'last sync is older than 1 hour; run rodo sync' },
  'status.waitingDecision': { fa: 'منتظر تصمیم شما', en: 'waiting for your decision' },
  'status.waitingApproval': { fa: 'منتظر تأیید شما', en: 'waiting for approval' },
  'test.none': { fa: 'برای این کارت دستور تست تعریف نشده (تست اختیاری است)', en: 'no test command for this card (tests are optional)' },
  'offline.note': { fa: 'حالت آفلاین: فقط بررسی کارت‌ها انجام شد', en: 'offline: cards were validated only' },
};

export function pickLang(flag: string | undefined, projectLang: string | undefined): Lang {
  return flag === 'fa' || flag === 'en' ? flag : projectLang === 'en' ? 'en' : 'fa';
}
export const t = (lang: Lang, key: string): string => T[key]?.[lang] ?? key;
