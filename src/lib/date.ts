export function todayKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(dateKey: string, amount: number): string {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + amount);
  return todayKey(date);
}

export function formatZhDate(dateKey: string): string {
  const date = parseDateKey(dateKey);
  return date.toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short"
  });
}

export function startOfWeek(dateKey: string): string {
  const date = parseDateKey(dateKey);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return todayKey(date);
}

export function endOfWeek(dateKey: string): string {
  return addDays(startOfWeek(dateKey), 6);
}

export function startOfMonth(dateKey: string): string {
  const date = parseDateKey(dateKey);
  return todayKey(new Date(date.getFullYear(), date.getMonth(), 1));
}

export function endOfMonth(dateKey: string): string {
  const date = parseDateKey(dateKey);
  return todayKey(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

export function daysInMonth(dateKey: string): string[] {
  const start = startOfMonth(dateKey);
  const end = endOfMonth(dateKey);
  const days: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

export function rangeLabel(start: string, end: string): string {
  return `${formatZhDate(start)} - ${formatZhDate(end)}`;
}

export function periodKey(period: "day" | "week" | "month", dateKey: string): string {
  if (period === "day") {
    return dateKey;
  }
  if (period === "week") {
    return `${startOfWeek(dateKey)}_${endOfWeek(dateKey)}`;
  }
  return startOfMonth(dateKey).slice(0, 7);
}

export function getPeriodRange(period: "day" | "week" | "month", dateKey: string) {
  if (period === "day") {
    return { start: dateKey, end: dateKey };
  }
  if (period === "week") {
    return { start: startOfWeek(dateKey), end: endOfWeek(dateKey) };
  }
  return { start: startOfMonth(dateKey), end: endOfMonth(dateKey) };
}
