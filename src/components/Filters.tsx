"use client";

import { Restaurant } from "@/lib/sheets";

export type FilterState = {
  country: Set<string>;
  category: Set<string>;
  foodType: Set<string>;
  locationArea: Set<string>;
  minDaysSinceVisit: number | null;
};

export const emptyFilter: FilterState = {
  country: new Set(),
  category: new Set(),
  foodType: new Set(),
  locationArea: new Set(),
  minDaysSinceVisit: null,
};

export function filterRestaurants(items: Restaurant[], f: FilterState): Restaurant[] {
  return items.filter((r) => {
    if (f.country.size > 0 && !f.country.has(r.country)) return false;
    if (f.category.size > 0 && !f.category.has(r.category)) return false;
    if (f.foodType.size > 0 && !f.foodType.has(r.foodType)) return false;
    if (f.locationArea.size > 0 && !f.locationArea.has(r.locationArea)) return false;
    if (f.minDaysSinceVisit != null) {
      // daysSinceVisit이 null이면 "한 번도 안 간 곳" → "N일 이상" 조건을 항상 통과시킴.
      if (r.daysSinceVisit != null && r.daysSinceVisit < f.minDaysSinceVisit) return false;
    }
    return true;
  });
}

function distinctValues(items: Restaurant[], key: keyof Restaurant): string[] {
  const set = new Set<string>();
  for (const r of items) {
    const v = r[key];
    if (typeof v === "string" && v.length > 0) set.add(v);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
}

type ChipRowProps = {
  label: string;
  values: string[];
  selected: Set<string>;
  onToggle: (v: string) => void;
};

function ChipRow({ label, values, selected, onToggle }: ChipRowProps) {
  if (values.length === 0) return null;
  return (
    <div className="mb-3">
      <div className="mb-1.5 text-xs text-slate-400">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => {
          const active = selected.has(v);
          return (
            <button
              key={v}
              type="button"
              onClick={() => onToggle(v)}
              className={`rounded-full px-3 py-1 text-xs transition ${
                active
                  ? "bg-amber-400 text-slate-900"
                  : "bg-white/10 text-slate-200 hover:bg-white/20"
              }`}
            >
              {v}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type Props = {
  restaurants: Restaurant[];
  filter: FilterState;
  setFilter: (f: FilterState) => void;
  eligibleCount: number;
};

export default function Filters({ restaurants, filter, setFilter, eligibleCount }: Props) {
  const countries = distinctValues(restaurants, "country");
  const categories = distinctValues(restaurants, "category");
  const foodTypes = distinctValues(restaurants, "foodType");
  const areas = distinctValues(restaurants, "locationArea");

  const toggle = (key: "country" | "category" | "foodType" | "locationArea") =>
    (value: string) => {
      const next = new Set(filter[key]);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      setFilter({ ...filter, [key]: next });
    };

  const setMinDays = (raw: string) => {
    const n = raw === "" ? null : parseInt(raw, 10);
    setFilter({ ...filter, minDaysSinceVisit: Number.isFinite(n) ? (n as number) : null });
  };

  const clearAll = () =>
    setFilter({
      country: new Set(),
      category: new Set(),
      foodType: new Set(),
      locationArea: new Set(),
      minDaysSinceVisit: null,
    });

  const hasAny =
    filter.country.size +
      filter.category.size +
      filter.foodType.size +
      filter.locationArea.size >
      0 || filter.minDaysSinceVisit != null;

  return (
    <details className="mb-6 rounded-xl bg-white/5 p-4 text-sm">
      <summary className="flex cursor-pointer items-center justify-between text-slate-300">
        <span>
          🔎 필터 {hasAny && <span className="ml-1 text-amber-300">(적용됨)</span>}
        </span>
        <span className="text-xs text-slate-400">
          후보 {eligibleCount}곳 / 전체 {restaurants.length}곳
        </span>
      </summary>

      <div className="mt-4 border-t border-white/10 pt-4">
        <ChipRow label="한/중/일식" values={countries} selected={filter.country} onToggle={toggle("country")} />
        <ChipRow label="음식 대분류" values={categories} selected={filter.category} onToggle={toggle("category")} />
        <ChipRow label="주 음식" values={foodTypes} selected={filter.foodType} onToggle={toggle("foodType")} />
        <ChipRow label="위치" values={areas} selected={filter.locationArea} onToggle={toggle("locationArea")} />

        <div className="mb-3">
          <label className="mb-1.5 block text-xs text-slate-400">
            최근 방문일로부터 최소 일수 (비워두면 제한 없음)
          </label>
          <input
            type="number"
            min={0}
            placeholder="예: 7"
            value={filter.minDaysSinceVisit ?? ""}
            onChange={(e) => setMinDays(e.target.value)}
            className="w-32 rounded-lg bg-white/10 px-3 py-1.5 text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-400"
          />
          <span className="ml-2 text-xs text-slate-500">일 이상 안 간 곳만</span>
        </div>

        {hasAny && (
          <button
            type="button"
            onClick={clearAll}
            className="mt-2 rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300 hover:bg-white/20"
          >
            필터 초기화
          </button>
        )}
      </div>
    </details>
  );
}
