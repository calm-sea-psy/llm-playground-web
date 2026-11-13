// 대화 목록의 날짜 묶음 · 시각 표시. 시각은 ms(Date.now 기준)이고 날짜는 브라우저의 지역 시간대로 나눈다. React 를 쓰지 않는다.

/** 하루 (ms) */
const DAY_MS = 24 * 60 * 60 * 1000;

/** 같은 날짜 묶음에 든 항목들 */
export interface DateGroup<T> {
  /** 오늘 · 어제 · 지난 7일 · 이전 */
  label: string;
  items: T[];
}

function startOfDay(time: number): number {
  const d = new Date(time);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dateGroupLabel(time: number, today: number): string {
  if (time >= today) {
    return "오늘";
  }
  if (time >= today - DAY_MS) {
    return "어제";
  }
  if (time >= today - 7 * DAY_MS) {
    return "지난 7일";
  }
  return "이전";
}

/**
 * 최신순으로 정렬된 항목을 날짜 묶음으로 나눈다 (묶음 순서도 최신순).
 *
 * @param items 최신순으로 정렬된 항목
 * @param timeOf 항목의 시각 (ms)
 * @param now 지금 시각 (ms). 오늘 · 어제를 가르는 기준
 */
export function groupByDate<T>(
  items: readonly T[],
  timeOf: (item: T) => number,
  now: number,
): Array<DateGroup<T>> {
  const today = startOfDay(now);
  const groups: Array<DateGroup<T>> = [];
  for (const item of items) {
    const label = dateGroupLabel(timeOf(item), today);
    const last = groups.at(-1);
    if (last?.label === label) {
      last.items.push(item);
    } else {
      groups.push({ label, items: [item] });
    }
  }
  return groups;
}

/** 목록에 보일 시각: 오늘이면 시:분, 올해면 월.일, 그 전이면 연.월.일 */
export function timeLabel(time: number, now: number): string {
  const d = new Date(time);
  const pad = (n: number): string => String(n).padStart(2, "0");
  if (time >= startOfDay(now)) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  if (d.getFullYear() === new Date(now).getFullYear()) {
    return `${d.getMonth() + 1}.${d.getDate()}`;
  }
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}
