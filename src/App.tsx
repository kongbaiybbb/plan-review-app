import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import {
  CalendarCheck,
  ChartNoAxesCombined,
  ClipboardList,
  BookOpenText,
  Gift,
  Plus,
  RefreshCw,
  Settings,
  Trash2
} from "lucide-react";
import {
  createId,
  db,
  ensureDefaults,
  exportAllData,
  getAllCategories,
  getActiveCategories,
  getActiveRewardClaims,
  getActiveRewardRules,
  getReviewsInRange,
  getJournalEntriesInRange,
  getTasksInRange,
  importAllData,
  markDeleted,
  nowIso,
  defaultCategories
} from "./lib/db";
import { addDays, daysInMonth, endOfMonth, formatZhDate, getPeriodRange, parseDateKey, periodKey, rangeLabel, startOfMonth, todayKey } from "./lib/date";
import { calculateCompletion, completionTone, isRewardMet } from "./lib/stats";
import { getSession, signInWithEmailPassword, signOut, signUpWithEmailPassword, supabase, isSyncConfigured } from "./lib/supabase";
import { initialSyncState, syncNow, type SyncState } from "./lib/sync";
import type { Category, JournalEntry, Period, ReviewEntry, RewardRule, Task } from "./lib/types";

type View = "plan" | "review" | "compare" | "journal" | "reward" | "settings";

const viewItems: Array<{ id: View; label: string; icon: typeof ClipboardList }> = [
  { id: "plan", label: "规划", icon: ClipboardList },
  { id: "review", label: "复盘", icon: CalendarCheck },
  { id: "compare", label: "对比", icon: ChartNoAxesCombined },
  { id: "journal", label: "日志", icon: BookOpenText },
  { id: "reward", label: "奖励", icon: Gift },
  { id: "settings", label: "设置", icon: Settings }
];

export function App() {
  const [view, setView] = useState<View>("plan");
  const [date, setDate] = useState(todayKey());
  const [categories, setCategories] = useState<Category[]>([]);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reviews, setReviews] = useState<ReviewEntry[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [rules, setRules] = useState<RewardRule[]>([]);
  const [claims, setClaims] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [syncState, setSyncState] = useState<SyncState>(initialSyncState);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const refresh = () => setRefreshKey((value) => value + 1);
  const syncAndRefresh = async (mode: "startup" | "manual" | "after-write" = "after-write") => {
    await syncNow(mode, setSyncState);
    refresh();
  };

  useEffect(() => {
    ensureDefaults().then(async () => {
      const session = await getSession();
      setUserEmail(session?.user.email ?? null);
      await syncAndRefresh("startup");
    });
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? null);
      if (session?.user) void syncAndRefresh("startup");
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncAndRefresh("startup");
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    const monthRange = getPeriodRange("month", date);
    const range = { start: addDays(monthRange.start, -7), end: addDays(monthRange.end, 7) };
    Promise.all([
      getActiveCategories(),
      getAllCategories(),
      getTasksInRange(range.start, range.end),
      getReviewsInRange(range.start, range.end),
      getJournalEntriesInRange(monthRange.start, monthRange.end),
      getActiveRewardRules(),
      getActiveRewardClaims()
    ]).then(([nextCategories, nextAllCategories, nextTasks, nextReviews, nextJournalEntries, nextRules, nextClaims]) => {
      setCategories(nextCategories);
      setAllCategories(nextAllCategories);
      setTasks(nextTasks);
      setReviews(nextReviews);
      setJournalEntries(nextJournalEntries);
      setRules(nextRules);
      setClaims(nextClaims.map((claim) => `${claim.ruleId}:${claim.periodKey}`));
    });
  }, [date, refreshKey]);

  const dayTasks = tasks.filter((task) => task.date === date);
  const dayReviews = reviews.filter((entry) => entry.date === date);
  const categoryMap = useMemo(() => new Map(allCategories.map((category) => [category.id, category])), [allCategories]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">个人计划复盘</p>
          <h1>{formatZhDate(date)}</h1>
        </div>
        <div className="date-controls" aria-label="日期选择">
          <button type="button" onClick={() => setDate(addDays(date, -1))}>‹</button>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          <button type="button" onClick={() => setDate(addDays(date, 1))}>›</button>
        </div>
      </header>

      <nav className="view-tabs" aria-label="主功能">
        {viewItems.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}>
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <main>
        {view === "plan" && <PlanView date={date} categories={categories} displayCategories={allCategories} tasks={dayTasks} refresh={refresh} syncAndRefresh={syncAndRefresh} />}
        {view === "review" && (
          <ReviewView date={date} categories={categories} tasks={dayTasks} reviews={dayReviews} categoryMap={categoryMap} syncAndRefresh={syncAndRefresh} />
        )}
        {view === "compare" && <CompareView date={date} categories={allCategories} tasks={tasks} reviews={reviews} />}
        {view === "journal" && <JournalView date={date} entries={journalEntries} setDate={setDate} syncAndRefresh={syncAndRefresh} />}
        {view === "reward" && <RewardView date={date} tasks={tasks} rules={rules} claims={claims} syncAndRefresh={syncAndRefresh} />}
        {view === "settings" && (
          <SettingsView
            categories={categories}
            userEmail={userEmail}
            syncState={syncState}
            refresh={refresh}
            syncAndRefresh={syncAndRefresh}
            setSyncState={setSyncState}
            setUserEmail={setUserEmail}
          />
        )}
      </main>
    </div>
  );
}

function PlanView({
  date,
  categories,
  displayCategories,
  tasks,
  refresh,
  syncAndRefresh
}: {
  date: string;
  categories: Category[];
  displayCategories: Category[];
  tasks: Task[];
  refresh: () => void;
  syncAndRefresh: (mode?: "startup" | "manual" | "after-write") => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!categoryId && categories[0]) setCategoryId(categories[0].id);
  }, [categories, categoryId]);

  async function addTask(event: FormEvent) {
    event.preventDefault();
    const cleaned = title.trim();
    if (!cleaned || !categoryId) return;
    const stamp = nowIso();
    await db.tasks.add({
      id: createId("task"),
      date,
      title: cleaned,
      categoryId,
      note: note.trim() || undefined,
      completed: false,
      createdAt: stamp,
      updatedAt: stamp
    });
    setTitle("");
    setNote("");
    refresh();
    void syncAndRefresh("after-write");
  }

  return (
    <section className="workspace-grid">
      <form className="panel form-panel" onSubmit={addTask}>
        <h2>今日规划</h2>
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="写下一个任务" />
        <CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} />
        <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="备注，可不填" />
        <button className="primary" type="submit"><Plus size={18} />添加任务</button>
      </form>
      <section className="panel">
        <PanelTitle title="计划色块" meta={`${tasks.length} 个任务`} />
        <BlockGrid items={tasks} categories={displayCategories} empty="今天还没有计划。" refresh={syncAndRefresh} editable />
      </section>
    </section>
  );
}

function ReviewView({
  categories,
  tasks,
  reviews,
  categoryMap,
  date,
  syncAndRefresh
}: {
  date: string;
  categories: Category[];
  tasks: Task[];
  reviews: ReviewEntry[];
  categoryMap: Map<string, Category>;
  syncAndRefresh: (mode?: "startup" | "manual" | "after-write") => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [slidingTaskIds, setSlidingTaskIds] = useState<string[]>([]);
  const stats = calculateCompletion(tasks);
  const pendingTasks = tasks.filter((task) => !task.completed);

  useEffect(() => {
    if (!categoryId && categories[0]) setCategoryId(categories[0].id);
  }, [categories, categoryId]);

  async function toggleTask(task: Task) {
    setSlidingTaskIds((ids) => [...new Set([...ids, task.id])]);
    window.setTimeout(() => {
      void completeTask(task);
    }, 260);
  }

  async function completeTask(task: Task) {
    const stamp = nowIso();
    await db.tasks.update(task.id, { completed: true, updatedAt: stamp });
    const existing = await db.reviewEntries.where("taskId").equals(task.id).first();
    if (existing) {
      await db.reviewEntries.put({ ...existing, deletedAt: undefined, updatedAt: stamp });
    } else {
      await db.reviewEntries.add({
        id: createId("review"),
        date: task.date,
        title: task.title,
        categoryId: task.categoryId,
        taskId: task.id,
        isAdHoc: false,
        createdAt: stamp,
        updatedAt: stamp
      });
    }
    setSlidingTaskIds((ids) => ids.filter((id) => id !== task.id));
    await syncAndRefresh("after-write");
  }

  async function addReview(event: FormEvent) {
    event.preventDefault();
    const cleaned = title.trim();
    if (!cleaned || !categoryId) return;
    const stamp = nowIso();
    await db.reviewEntries.add({
      id: createId("review"),
      date,
      title: cleaned,
      categoryId,
      isAdHoc: true,
      createdAt: stamp,
      updatedAt: stamp
    });
    setTitle("");
    await syncAndRefresh("after-write");
  }

  return (
    <section className="workspace-grid">
      <section className="panel">
        <PanelTitle title="复盘勾选" meta={`${stats.percent}% · ${stats.label}`} />
        <div className={`meter ${completionTone(stats.percent)}`}><span style={{ width: `${stats.percent}%` }} /></div>
        <div className="check-list">
          {tasks.length === 0 && <p className="empty">今天暂无计划。</p>}
          {tasks.length > 0 && pendingTasks.length === 0 && <p className="empty">计划任务都完成了。</p>}
          {pendingTasks.map((task) => {
            const category = categoryMap.get(task.categoryId);
            return (
              <label key={task.id} className={slidingTaskIds.includes(task.id) ? "check-row slide-out" : "check-row"}>
                <input type="checkbox" checked={slidingTaskIds.includes(task.id)} onChange={() => toggleTask(task)} disabled={slidingTaskIds.includes(task.id)} />
                <span className="swatch" style={{ background: category?.color }} />
                <span>{task.title}</span>
              </label>
            );
          })}
        </div>
      </section>
      <section className="panel">
        <PanelTitle title="实际色块" meta={`${reviews.length} 条记录`} />
        <form className="inline-form" onSubmit={addReview}>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="补录临时做过的事" />
          <CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} compact />
          <button className="icon-button" aria-label="补录" type="submit"><Plus size={18} /></button>
        </form>
        <BlockGrid items={reviews} categories={categories} empty="完成的任务和补录事项会出现在这里。" />
      </section>
    </section>
  );
}

function CompareView({ date, categories, tasks, reviews }: { date: string; categories: Category[]; tasks: Task[]; reviews: ReviewEntry[] }) {
  const [mode, setMode] = useState<Period>("week");
  const range = getPeriodRange(mode, date);
  const rangeTasks = tasks.filter((task) => task.date >= range.start && task.date <= range.end);
  const rangeReviews = reviews.filter((entry) => entry.date >= range.start && entry.date <= range.end);
  const stats = calculateCompletion(rangeTasks);
  const rangeDays = getDaysInRange(range.start, range.end);

  return (
    <section className="stack">
      <div className="panel summary-panel">
        <div>
          <h2>{mode === "week" ? "周对比" : "月对比"}</h2>
          <p>{rangeLabel(range.start, range.end)}</p>
        </div>
        <div className="segmented">
          <button className={mode === "week" ? "active" : ""} onClick={() => setMode("week")}>周</button>
          <button className={mode === "month" ? "active" : ""} onClick={() => setMode("month")}>月</button>
        </div>
        <div className={`score ${completionTone(stats.percent)}`}>{stats.percent}%</div>
      </div>
      <MonthlyHeatmap date={date} tasks={tasks} />
      <section className="compare-grid">
        <div className="panel">
          <PanelTitle title="计划" meta={`${rangeTasks.length} 个`} />
          <GroupedDayBlocks days={rangeDays} items={rangeTasks} categories={categories} empty="该周期暂无计划。" />
        </div>
        <div className="panel">
          <PanelTitle title="实际" meta={`${rangeReviews.length} 个`} />
          <GroupedDayBlocks days={rangeDays} items={rangeReviews} categories={categories} empty="该周期暂无复盘记录。" />
        </div>
      </section>
      <ActualCategoryGantt days={rangeDays} reviews={rangeReviews} categories={categories} />
    </section>
  );
}

function getDaysInRange(start: string, end: string) {
  const days: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

function GroupedDayBlocks({
  days,
  items,
  categories,
  empty
}: {
  days: string[];
  items: Array<Task | ReviewEntry>;
  categories: Category[];
  empty: string;
}) {
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  if (items.length === 0) return <p className="empty">{empty}</p>;

  return (
    <div className="day-group-list">
      {days.map((day) => {
        const dayItems = items.filter((item) => item.date === day);
        if (dayItems.length === 0) return null;
        const categoryIds = [...new Set(dayItems.map((item) => item.categoryId))];
        return (
          <section key={day} className="day-group">
            <div className="day-group-title">
              <strong>{formatZhDate(day)}</strong>
              <span>{dayItems.length} 个</span>
            </div>
            <div className="category-group-list">
              {categoryIds.map((categoryId) => {
                const category = categoryMap.get(categoryId);
                const categoryItems = dayItems.filter((item) => item.categoryId === categoryId);
                return (
                  <div key={categoryId} className="category-group">
                    <div className="category-group-title">
                      <span className="swatch" style={{ background: category?.color }} />
                      <strong>{category?.name ?? "未分类"}</strong>
                      <small>{categoryItems.length}</small>
                    </div>
                    <BlockGrid items={categoryItems} categories={categories} empty="" />
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ActualCategoryGantt({ days, reviews, categories }: { days: string[]; reviews: ReviewEntry[]; categories: Category[] }) {
  const categoryMap = new Map(categories.map((category) => [category.id, category]));

  return (
    <section className="panel gantt-panel">
      <PanelTitle title="实际分类甘特图" meta="按复盘记录占比" />
      <div className="gantt-list">
        {days.map((day) => {
          const dayReviews = reviews.filter((entry) => entry.date === day);
          const total = dayReviews.length;
          const categoryIds = [...new Set(dayReviews.map((entry) => entry.categoryId))];
          return (
            <div key={day} className="gantt-row">
              <div className="gantt-date">
                <strong>{formatZhDate(day)}</strong>
                <span>{total ? `${total} 条` : "无记录"}</span>
              </div>
              {total === 0 ? (
                <div className="gantt-empty">暂无实际记录</div>
              ) : (
                <div className="gantt-bar">
                  {categoryIds.map((categoryId) => {
                    const category = categoryMap.get(categoryId);
                    const count = dayReviews.filter((entry) => entry.categoryId === categoryId).length;
                    const percent = Math.round((count / total) * 100);
                    return (
                      <div
                        key={categoryId}
                        className="gantt-segment"
                        style={{ width: `${percent}%`, background: category?.color ?? "#888" }}
                        title={`${category?.name ?? "未分类"} · ${count} 条 · ${percent}%`}
                      >
                        <span>{category?.name ?? "未分类"}</span>
                        <strong>{count}</strong>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MonthlyHeatmap({ date, tasks }: { date: string; tasks: Task[] }) {
  const monthDays = daysInMonth(date);
  const leadingBlanks = (parseDateKey(startOfMonth(date)).getDay() + 6) % 7;
  const weekdays = ["一", "二", "三", "四", "五", "六", "日"];

  return (
    <section className="panel heatmap-panel">
      <PanelTitle title="本月热力图" meta={startOfMonth(date).slice(0, 7)} />
      <div className="heatmap-legend" aria-label="热力图图例">
        <span><span className="legend-dot perfect" />😎 perfect</span>
        <span><span className="legend-dot good" />🙂 good</span>
        <span><span className="legend-dot bad" />😭 拉完了</span>
        <span><span className="legend-dot empty-day" />无计划</span>
      </div>
      <div className="heatmap-weekdays" aria-hidden="true">
        {weekdays.map((weekday) => <span key={weekday}>{weekday}</span>)}
      </div>
      <div className="heatmap-grid">
        {Array.from({ length: leadingBlanks }).map((_, index) => (
          <span key={`blank-${index}`} className="heatmap-blank" />
        ))}
        {monthDays.map((day) => {
          const stats = calculateCompletion(tasks.filter((task) => task.date === day));
          const state = getHeatmapState(stats.percent, stats.hasPlan);
          const dayNumber = parseDateKey(day).getDate();
          return (
            <article key={day} className={`heatmap-day ${state.className}`} title={`${day} · ${stats.label} · ${state.label}`}>
              <strong>{dayNumber}</strong>
              {stats.hasPlan ? (
                <>
                  <span className="heatmap-emoji">{state.emoji}</span>
                  <small>{stats.percent}% {state.label}</small>
                </>
              ) : (
                <small>无计划</small>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function getHeatmapState(percent: number, hasPlan: boolean) {
  if (!hasPlan) return { className: "no-plan", emoji: "", label: "无计划" };
  if (percent >= 80) return { className: "perfect", emoji: "😎", label: "perfect" };
  if (percent >= 40) return { className: "good", emoji: "🙂", label: "good" };
  return { className: "bad", emoji: "😭", label: "拉完了" };
}

const moodOptions = ["🙂", "😐", "😔", "🔥", "🌧️", "😌"];

function emptyJournalDraft(date: string) {
  return {
    date,
    moodEmoji: "🙂",
    moodText: "",
    energyLevel: 3,
    stressLevel: 3,
    focusLevel: 3,
    bodyState: "",
    mindState: "",
    keyEvents: "",
    gratitudeText: "",
    reflectionText: "",
    tomorrowText: "",
    freeText: "",
    promptsOpen: true
  };
}

function JournalView({
  date,
  entries,
  setDate,
  syncAndRefresh
}: {
  date: string;
  entries: JournalEntry[];
  setDate: (date: string) => void;
  syncAndRefresh: (mode?: "startup" | "manual" | "after-write") => Promise<void>;
}) {
  const activeEntry = entries.find((entry) => entry.date === date);
  const [draft, setDraft] = useState(emptyJournalDraft(date));
  const monthDays = daysInMonth(date);
  const leadingBlanks = (parseDateKey(startOfMonth(date)).getDay() + 6) % 7;
  const recentEntries = [...entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  const entryDates = new Set(entries.map((entry) => entry.date));

  useEffect(() => {
    setDraft({
      ...emptyJournalDraft(date),
      ...activeEntry,
      moodEmoji: activeEntry?.moodEmoji ?? "🙂",
      moodText: activeEntry?.moodText ?? "",
      energyLevel: activeEntry?.energyLevel ?? 3,
      stressLevel: activeEntry?.stressLevel ?? 3,
      focusLevel: activeEntry?.focusLevel ?? 3,
      bodyState: activeEntry?.bodyState ?? "",
      mindState: activeEntry?.mindState ?? "",
      keyEvents: activeEntry?.keyEvents ?? "",
      gratitudeText: activeEntry?.gratitudeText ?? "",
      reflectionText: activeEntry?.reflectionText ?? "",
      tomorrowText: activeEntry?.tomorrowText ?? "",
      freeText: activeEntry?.freeText ?? "",
      promptsOpen: activeEntry?.promptsOpen ?? true
    });
  }, [activeEntry?.id, activeEntry?.updatedAt, date]);

  function updateDraft<K extends keyof ReturnType<typeof emptyJournalDraft>>(key: K, value: ReturnType<typeof emptyJournalDraft>[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function saveJournal(event: FormEvent) {
    event.preventDefault();
    const stamp = nowIso();
    const payload = {
      date,
      moodEmoji: draft.moodEmoji || undefined,
      moodText: draft.moodText.trim() || undefined,
      energyLevel: draft.energyLevel,
      stressLevel: draft.stressLevel,
      focusLevel: draft.focusLevel,
      bodyState: draft.bodyState.trim() || undefined,
      mindState: draft.mindState.trim() || undefined,
      keyEvents: draft.keyEvents.trim() || undefined,
      gratitudeText: draft.gratitudeText.trim() || undefined,
      reflectionText: draft.reflectionText.trim() || undefined,
      tomorrowText: draft.tomorrowText.trim() || undefined,
      freeText: draft.freeText.trim() || undefined,
      promptsOpen: draft.promptsOpen,
      updatedAt: stamp,
      deletedAt: undefined
    };

    if (activeEntry) {
      await db.journalEntries.put({ ...activeEntry, ...payload });
    } else {
      await db.journalEntries.add({
        id: createId("journal"),
        createdAt: stamp,
        ...payload
      });
    }
    await syncAndRefresh("after-write");
  }

  async function deleteJournal() {
    if (!activeEntry) return;
    await markDeleted("journalEntries", activeEntry.id);
    await syncAndRefresh("after-write");
  }

  return (
    <section className="workspace-grid journal-layout">
      <section className="panel journal-sidebar">
        <PanelTitle title="日志月历" meta={startOfMonth(date).slice(0, 7)} />
        <div className="journal-calendar-weekdays" aria-hidden="true">
          {["一", "二", "三", "四", "五", "六", "日"].map((weekday) => <span key={weekday}>{weekday}</span>)}
        </div>
        <div className="journal-calendar">
          {Array.from({ length: leadingBlanks }).map((_, index) => <span key={`journal-blank-${index}`} />)}
          {monthDays.map((day) => {
            const hasEntry = entryDates.has(day);
            const isSelected = day === date;
            return (
              <button key={day} type="button" className={`${hasEntry ? "has-entry" : ""} ${isSelected ? "selected" : ""}`} onClick={() => setDate(day)}>
                <strong>{parseDateKey(day).getDate()}</strong>
                {hasEntry && <span>•</span>}
              </button>
            );
          })}
        </div>
        <PanelTitle title="最近日志" meta={`${recentEntries.length} 篇`} />
        <div className="journal-recent-list">
          {recentEntries.length === 0 && <p className="empty">还没有日志。</p>}
          {recentEntries.map((entry) => (
            <button key={entry.id} type="button" className={entry.date === date ? "active" : ""} onClick={() => setDate(entry.date)}>
              <span>{entry.moodEmoji ?? "📝"}</span>
              <div>
                <strong>{formatZhDate(entry.date)}</strong>
                <small>{entry.moodText || entry.freeText || entry.reflectionText || "未填写摘要"}</small>
              </div>
            </button>
          ))}
        </div>
      </section>

      <form className="panel journal-editor" onSubmit={saveJournal}>
        <PanelTitle title="今日日志" meta={formatZhDate(date)} />
        <div className="mood-picker">
          {moodOptions.map((emoji) => (
            <button key={emoji} type="button" className={draft.moodEmoji === emoji ? "selected" : ""} onClick={() => updateDraft("moodEmoji", emoji)}>
              {emoji}
            </button>
          ))}
        </div>
        <input value={draft.moodText} onChange={(event) => updateDraft("moodText", event.target.value)} placeholder="今天的情绪或状态关键词" />
        <div className="journal-metrics">
          <NumberField label="精力" value={draft.energyLevel} onChange={(value) => updateDraft("energyLevel", value)} />
          <NumberField label="压力" value={draft.stressLevel} onChange={(value) => updateDraft("stressLevel", value)} />
          <NumberField label="专注" value={draft.focusLevel} onChange={(value) => updateDraft("focusLevel", value)} />
        </div>
        <textarea value={draft.bodyState} onChange={(event) => updateDraft("bodyState", event.target.value)} placeholder="身体状态" />
        <textarea value={draft.mindState} onChange={(event) => updateDraft("mindState", event.target.value)} placeholder="心理状态" />
        <textarea value={draft.keyEvents} onChange={(event) => updateDraft("keyEvents", event.target.value)} placeholder="今日关键事件" />
        <button className="secondary" type="button" onClick={() => updateDraft("promptsOpen", !draft.promptsOpen)}>
          {draft.promptsOpen ? "收起引导问题" : "展开引导问题"}
        </button>
        {draft.promptsOpen && (
          <div className="journal-prompts">
            <textarea value={draft.gratitudeText} onChange={(event) => updateDraft("gratitudeText", event.target.value)} placeholder="今天感谢" />
            <textarea value={draft.reflectionText} onChange={(event) => updateDraft("reflectionText", event.target.value)} placeholder="今天反思" />
            <textarea value={draft.tomorrowText} onChange={(event) => updateDraft("tomorrowText", event.target.value)} placeholder="明日提醒" />
          </div>
        )}
        <textarea className="journal-free-text" value={draft.freeText} onChange={(event) => updateDraft("freeText", event.target.value)} placeholder="自由日记正文" />
        <div className="journal-actions">
          <button className="primary" type="submit">保存日志</button>
          <button className="secondary" type="button" disabled={!activeEntry} onClick={deleteJournal}>删除日志</button>
        </div>
      </form>
    </section>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="number-field">
      <span>{label} {value}</span>
      <input type="range" min="1" max="5" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function RewardView({
  date,
  tasks,
  rules,
  claims,
  syncAndRefresh
}: {
  date: string;
  tasks: Task[];
  rules: RewardRule[];
  claims: string[];
  syncAndRefresh: (mode?: "startup" | "manual" | "after-write") => Promise<void>;
}) {
  const [period, setPeriod] = useState<Period>("week");
  const [threshold, setThreshold] = useState(80);
  const [rewardText, setRewardText] = useState("");
  const [claimingRuleIds, setClaimingRuleIds] = useState<string[]>([]);

  async function addRule(event: FormEvent) {
    event.preventDefault();
    const cleaned = rewardText.trim();
    if (!cleaned) return;
    const stamp = nowIso();
    await db.rewardRules.add({
      id: createId("reward"),
      period,
      thresholdPercent: threshold,
      rewardText: cleaned,
      active: true,
      updatedAt: stamp
    });
    setRewardText("");
    await syncAndRefresh("after-write");
  }

  return (
    <section className="workspace-grid">
      <form className="panel form-panel" onSubmit={addRule}>
        <h2>目标奖励</h2>
        <div className="segmented full">
          <button type="button" className={period === "day" ? "active" : ""} onClick={() => setPeriod("day")}>日</button>
          <button type="button" className={period === "week" ? "active" : ""} onClick={() => setPeriod("week")}>周</button>
          <button type="button" className={period === "month" ? "active" : ""} onClick={() => setPeriod("month")}>月</button>
        </div>
        <label className="field-label">完成率门槛 {threshold}%</label>
        <input type="range" min="10" max="100" step="5" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} />
        <input value={rewardText} onChange={(event) => setRewardText(event.target.value)} placeholder="达标后奖励自己什么" />
        <button className="primary" type="submit"><Plus size={18} />添加奖励</button>
      </form>
      <section className="panel reward-list">
        <PanelTitle title="当前奖励" meta={`${rules.length} 条规则`} />
        {rules.length === 0 && <p className="empty">还没有奖励规则。</p>}
        {rules.map((rule) => {
          const range = getPeriodRange(rule.period, date);
          const stats = calculateCompletion(tasks.filter((task) => task.date >= range.start && task.date <= range.end));
          const key = periodKey(rule.period, date);
          const met = isRewardMet(rule, stats);
          const claimed = claims.includes(`${rule.id}:${key}`);
          const animating = claimingRuleIds.includes(rule.id);
          return (
            <article key={rule.id} className={animating ? "reward-card claimed-flash" : "reward-card"}>
              <div className="reward-card-main">
                <div className="reward-card-head">
                  <strong>{rule.rewardText}</strong>
                  <span>{periodLabel(rule.period)} · 门槛 {rule.thresholdPercent}%</span>
                </div>
                <div className={`reward-progress ${completionTone(stats.percent)}`}>
                  <span style={{ width: `${stats.percent}%` }} />
                </div>
                <p>{stats.hasPlan ? `${stats.completed}/${stats.planned} · 当前 ${stats.percent}%` : "暂无计划"}</p>
              </div>
              <button
                className={met ? "primary small" : "small"}
                disabled={!met || claimed}
                onClick={async () => {
                  setClaimingRuleIds((ids) => [...new Set([...ids, rule.id])]);
                  const stamp = nowIso();
                  await db.rewardClaims.add({
                    id: createId("claim"),
                    ruleId: rule.id,
                    period: rule.period,
                    periodKey: key,
                    claimedAt: stamp,
                    updatedAt: stamp
                  });
                  await syncAndRefresh("after-write");
                  window.setTimeout(() => {
                    setClaimingRuleIds((ids) => ids.filter((id) => id !== rule.id));
                  }, 760);
                }}
              >
                {claimed ? "已领取" : met ? "领取" : "未达标"}
              </button>
            </article>
          );
        })}
      </section>
    </section>
  );
}

function periodLabel(period: Period) {
  if (period === "day") return "每日";
  if (period === "week") return "每周";
  return "每月";
}

function SettingsView({
  categories,
  userEmail,
  syncState,
  refresh,
  syncAndRefresh,
  setSyncState,
  setUserEmail
}: {
  categories: Category[];
  userEmail: string | null;
  syncState: SyncState;
  refresh: () => void;
  syncAndRefresh: (mode?: "startup" | "manual" | "after-write") => Promise<void>;
  setSyncState: (state: SyncState) => void;
  setUserEmail: (email: string | null) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("#7c6f57");

  async function exportData() {
    const payload = await exportAllData();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `plan-review-${todayKey()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importData(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    await importAllData(JSON.parse(await file.text()));
    event.target.value = "";
    refresh();
    void syncAndRefresh("after-write");
  }

  async function handlePasswordAuth(action: "sign-in" | "sign-up") {
    const cleanedEmail = email.trim();
    if (!cleanedEmail || !password) {
      setSyncState({ status: "error", message: "请输入邮箱和密码。" });
      return;
    }
    if (password.length < 6) {
      setSyncState({ status: "error", message: "密码至少需要 6 位。" });
      return;
    }
    try {
      const session =
        action === "sign-in"
          ? await signInWithEmailPassword(cleanedEmail, password)
          : await signUpWithEmailPassword(cleanedEmail, password);
      const nextSession = session ?? (await getSession());

      if (nextSession?.user) {
        setUserEmail(nextSession.user.email ?? cleanedEmail);
        setSyncState({ status: "syncing", message: action === "sign-in" ? "登录成功，正在同步" : "注册成功，正在同步" });
        await syncAndRefresh("startup");
        return;
      }

      setSyncState({
        status: "signed-out",
        message: "注册邮件已发送，请先确认邮箱，再返回这里登录。"
      });
    } catch (error) {
      setSyncState({ status: "error", message: getAuthErrorMessage(error) });
    }
  }

  async function submitPasswordLogin(event: FormEvent) {
    event.preventDefault();
    await handlePasswordAuth("sign-in");
  }

  async function handleSignOut() {
    await signOut();
    setUserEmail(null);
    setSyncState({ status: isSyncConfigured ? "signed-out" : "not-configured", message: "已退出，当前仅本地保存" });
  }

  async function addCategory(event: FormEvent) {
    event.preventDefault();
    const cleaned = newCategoryName.trim();
    if (!cleaned) return;
    const stamp = nowIso();
    await db.categories.add({
      id: createId("category"),
      name: cleaned,
      color: newCategoryColor,
      updatedAt: stamp
    });
    setNewCategoryName("");
    refresh();
    void syncAndRefresh("after-write");
  }

  return (
    <section className="workspace-grid">
      <section className="panel form-panel">
        <PanelTitle title="同步账号" meta={syncState.message} />
        {userEmail ? (
          <>
            <p className="sync-user">{userEmail}</p>
            <button className="primary" type="button" onClick={() => syncAndRefresh("manual")}>
              <RefreshCw size={18} />立即同步
            </button>
            <button type="button" className="secondary" onClick={handleSignOut}>退出登录</button>
          </>
        ) : (
          <form className="form-panel compact-form" onSubmit={submitPasswordLogin}>
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="邮箱" autoComplete="email" disabled={!isSyncConfigured} />
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="密码，至少 6 位" autoComplete="current-password" disabled={!isSyncConfigured} />
            <div className="auth-actions">
              <button className="primary" type="submit" disabled={!isSyncConfigured}>登录</button>
              <button className="secondary" type="button" disabled={!isSyncConfigured} onClick={() => handlePasswordAuth("sign-up")}>注册</button>
            </div>
          </form>
        )}
        {!isSyncConfigured && <p className="empty">请先在 `.env` 中配置 Supabase URL 和 anon key。</p>}
      </section>

      <section className="panel">
        <PanelTitle title="分类颜色" meta={`${categories.length} 个`} />
        <form className="category-add-form" onSubmit={addCategory}>
          <input
            type="color"
            value={newCategoryColor}
            onChange={(event) => setNewCategoryColor(event.target.value)}
            aria-label="新分类颜色"
          />
          <input
            value={newCategoryName}
            onChange={(event) => setNewCategoryName(event.target.value)}
            placeholder="添加分类，比如兴趣爱好"
          />
          <button className="icon-button add-category-button" type="submit" aria-label="添加分类">
            <Plus size={18} />
          </button>
        </form>
        <button
          className="secondary reset-button"
          type="button"
          onClick={async () => {
            const stamp = nowIso();
            await Promise.all(defaultCategories.map((category) => db.categories.update(category.id, { name: category.name, color: category.color, updatedAt: stamp, deletedAt: undefined })));
            refresh();
            void syncAndRefresh("after-write");
          }}
        >
          恢复默认分类
        </button>
        <div className="category-list">
          {categories.map((category) => (
            <div key={category.id} className="category-row">
              <input
                type="color"
                value={category.color}
                onChange={async (event) => {
                  await db.categories.update(category.id, { color: event.target.value, updatedAt: nowIso() });
                  refresh();
                  void syncAndRefresh("after-write");
                }}
              />
              <CategoryNameInput category={category} refresh={refresh} syncAndRefresh={syncAndRefresh} />
              <button
                type="button"
                className="icon-button category-delete-button"
                aria-label={`删除分类 ${category.name}`}
                onClick={async () => {
                  await markDeleted("categories", category.id);
                  refresh();
                  void syncAndRefresh("after-write");
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="panel form-panel">
        <h2>数据备份</h2>
        <button className="primary" onClick={exportData} type="button">导出 JSON</button>
        <label className="file-button">
          导入 JSON
          <input type="file" accept="application/json" onChange={importData} />
        </label>
      </section>
    </section>
  );
}

function CategoryNameInput({
  category,
  refresh,
  syncAndRefresh
}: {
  category: Category;
  refresh: () => void;
  syncAndRefresh: (mode?: "startup" | "manual" | "after-write") => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function save() {
    const input = inputRef.current;
    if (!input) return;
    const cleaned = input.value.trim();
    if (!cleaned || cleaned === category.name) {
      input.value = category.name;
      return;
    }
    await db.categories.update(category.id, { name: cleaned, updatedAt: nowIso() });
    refresh();
    void syncAndRefresh("after-write");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }
  }

  return (
    <input
      ref={inputRef}
      defaultValue={category.name}
      onBlur={save}
      onKeyDown={handleKeyDown}
    />
  );
}

function getAuthErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "登录失败，请稍后再试。";
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) return "邮箱或密码不正确。";
  if (normalized.includes("email not confirmed")) return "邮箱还没有确认，请先打开确认邮件。";
  if (normalized.includes("already registered") || normalized.includes("user already registered")) return "这个邮箱已经注册，请直接登录。";
  if (normalized.includes("password")) return message;
  if (normalized.includes("rate limit")) return "操作太频繁，请稍后再试。";
  return message;
}

function PanelTitle({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="panel-title">
      <h2>{title}</h2>
      <span>{meta}</span>
    </div>
  );
}

function CategoryPicker({
  categories,
  value,
  onChange,
  compact = false
}: {
  categories: Category[];
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "category-picker compact" : "category-picker"}>
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          className={value === category.id ? "selected" : ""}
          onClick={() => onChange(category.id)}
          title={category.name}
        >
          <span style={{ background: category.color }} />
          {!compact && category.name}
        </button>
      ))}
    </div>
  );
}

function BlockGrid({
  items,
  categories,
  empty,
  editable = false,
  refresh
}: {
  items: Array<Task | ReviewEntry>;
  categories: Category[];
  empty: string;
  editable?: boolean;
  refresh?: () => Promise<void>;
}) {
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  if (items.length === 0) return <p className="empty">{empty}</p>;

  return (
    <div className="block-grid">
      {items.map((item) => {
        const category = categoryMap.get(item.categoryId);
        const isTask = "completed" in item;
        return (
          <article
            key={item.id}
            className={isTask && item.completed ? "task-block completed" : "task-block"}
            style={{ borderColor: category?.color, background: `${category?.color ?? "#888"}22` }}
          >
            <span className="block-dot" style={{ background: category?.color }} />
            <strong>{item.title}</strong>
            <small>{category?.name ?? "未分类"}{!isTask && item.isAdHoc ? " · 补录" : ""}</small>
            {editable && (
              <button
                className="delete-button"
                aria-label="删除任务"
                onClick={async () => {
                  await markDeleted("tasks", item.id);
                  const linkedReviews = await db.reviewEntries.where("taskId").equals(item.id).toArray();
                  await Promise.all(linkedReviews.map((entry) => markDeleted("reviewEntries", entry.id)));
                  await refresh?.();
                }}
              >
                <Trash2 size={16} />
              </button>
            )}
          </article>
        );
      })}
    </div>
  );
}
