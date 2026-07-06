import { Handlers, PageProps } from "$fresh/server.ts";
import { AppShell } from "$components/Layout.tsx";
import { getFarmsByFarmer } from "$lib/farm.ts";
import { query } from "$db/client.ts";
import type { AuthState } from "../../middlewares/auth.ts";
import { CROP_TYPES } from "$utils/constants.ts";

interface CalendarTask {
  id: string;
  date: string;
  type: string;
  title: string;
  description: string;
  farmName: string;
  farmId: string;
  crop: string;
  completed: boolean;
  priority: string;
}

interface FarmData {
  id: string;
  name: string;
  cropType: string;
  sowingDate: Date | null;
  daysAfterSowing: number;
  stage: string;
}

interface CalendarPageData {
  tasks: CalendarTask[];
  farms: FarmData[];
  currentMonth: number;
  currentYear: number;
  todayStr: string;
  cropGuide: Array<{
    crop: string;
    name: string;
    sowingMonths: string;
    harvestMonths: string;
    duration: number;
    irrigation: number;
  }>;
}

interface CropCalendarEntry {
  sowingMonths: number[];
  harvestMonths: number[];
  durationDays: number;
  irrigationIntervalDays: number;
  activities: Array<{
    dayOffset: number;
    type: string;
    title: string;
    description: string;
    priority: string;
  }>;
}

// Crop calendar data
const CROP_DATA: Record<string, CropCalendarEntry> = {
  rice: {
    sowingMonths: [5, 6],
    harvestMonths: [10, 11],
    durationDays: 120,
    irrigationIntervalDays: 7,
    activities: [
      {
        dayOffset: 0,
        type: "sowing",
        title: "Transplanting",
        description: "Transplant 25-30 day old seedlings",
        priority: "high",
      },
      {
        dayOffset: 21,
        type: "fertilizer",
        title: "First Urea",
        description: "Apply 25 kg/acre Urea",
        priority: "high",
      },
      {
        dayOffset: 45,
        type: "fertilizer",
        title: "Second Fertilizer",
        description: "Apply 20 kg/acre Urea + Zinc",
        priority: "high",
      },
      {
        dayOffset: 60,
        type: "pesticide",
        title: "Pest Check",
        description: "Scout for stem borer",
        priority: "high",
      },
      {
        dayOffset: 7,
        type: "irrigation",
        title: "Irrigation",
        description: "Maintain 5cm water",
        priority: "medium",
      },
      {
        dayOffset: 14,
        type: "irrigation",
        title: "Irrigation",
        description: "Regular irrigation",
        priority: "medium",
      },
      {
        dayOffset: 28,
        type: "irrigation",
        title: "Irrigation",
        description: "Tillering irrigation",
        priority: "medium",
      },
      {
        dayOffset: 70,
        type: "irrigation",
        title: "Flowering",
        description: "Critical stage irrigation",
        priority: "high",
      },
      {
        dayOffset: 120,
        type: "harvest",
        title: "Harvest",
        description: "Harvest at 80% straw color",
        priority: "high",
      },
    ],
  },
  wheat: {
    sowingMonths: [10, 11],
    harvestMonths: [3, 4],
    durationDays: 140,
    irrigationIntervalDays: 21,
    activities: [
      {
        dayOffset: 0,
        type: "sowing",
        title: "Seed Sowing",
        description: "Sow at 100 kg/ha",
        priority: "high",
      },
      {
        dayOffset: 21,
        type: "irrigation",
        title: "Crown Root Irrigation",
        description: "Critical first irrigation",
        priority: "high",
      },
      {
        dayOffset: 25,
        type: "fertilizer",
        title: "Urea Top Dressing",
        description: "Apply 30 kg/acre Urea",
        priority: "high",
      },
      {
        dayOffset: 42,
        type: "irrigation",
        title: "Tillering Irrigation",
        description: "Second irrigation",
        priority: "medium",
      },
      {
        dayOffset: 63,
        type: "irrigation",
        title: "Jointing Irrigation",
        description: "Third irrigation",
        priority: "medium",
      },
      {
        dayOffset: 84,
        type: "irrigation",
        title: "Flowering Irrigation",
        description: "Critical for grain set",
        priority: "high",
      },
      {
        dayOffset: 140,
        type: "harvest",
        title: "Harvest",
        description: "Harvest when grains are hard",
        priority: "high",
      },
    ],
  },
  cotton: {
    sowingMonths: [4, 5],
    harvestMonths: [10, 11],
    durationDays: 180,
    irrigationIntervalDays: 15,
    activities: [
      {
        dayOffset: 0,
        type: "sowing",
        title: "Seed Sowing",
        description: "Plant Bt cotton",
        priority: "high",
      },
      {
        dayOffset: 20,
        type: "fertilizer",
        title: "First Fertilizer",
        description: "Apply DAP + Urea",
        priority: "high",
      },
      {
        dayOffset: 45,
        type: "pesticide",
        title: "Bollworm Check",
        description: "Set pheromone traps",
        priority: "high",
      },
      {
        dayOffset: 60,
        type: "fertilizer",
        title: "Second Fertilizer",
        description: "Apply 25 kg Urea/acre",
        priority: "high",
      },
      {
        dayOffset: 30,
        type: "irrigation",
        title: "Irrigation",
        description: "Regular irrigation",
        priority: "medium",
      },
      {
        dayOffset: 50,
        type: "irrigation",
        title: "Square Formation",
        description: "Critical stage",
        priority: "high",
      },
      {
        dayOffset: 120,
        type: "task",
        title: "First Picking",
        description: "Pick opened bolls",
        priority: "high",
      },
      {
        dayOffset: 180,
        type: "harvest",
        title: "Final Harvest",
        description: "Complete harvest",
        priority: "high",
      },
    ],
  },
  soybean: {
    sowingMonths: [5, 6],
    harvestMonths: [9, 10],
    durationDays: 100,
    irrigationIntervalDays: 15,
    activities: [
      {
        dayOffset: 0,
        type: "sowing",
        title: "Seed Sowing",
        description: "Sow 30 kg/acre with Rhizobium",
        priority: "high",
      },
      {
        dayOffset: 20,
        type: "fertilizer",
        title: "Fertilizer",
        description: "Apply 8 kg N + 20 kg P/acre",
        priority: "medium",
      },
      {
        dayOffset: 30,
        type: "irrigation",
        title: "First Irrigation",
        description: "Pre-flowering moisture",
        priority: "high",
      },
      {
        dayOffset: 45,
        type: "pesticide",
        title: "Insect Control",
        description: "Scout for girdle beetle",
        priority: "high",
      },
      {
        dayOffset: 50,
        type: "irrigation",
        title: "Flowering Irrigation",
        description: "Peak flowering",
        priority: "high",
      },
      {
        dayOffset: 100,
        type: "harvest",
        title: "Harvest",
        description: "Harvest at 95% brown pods",
        priority: "high",
      },
    ],
  },
  sugarcane: {
    sowingMonths: [1, 2],
    harvestMonths: [11, 12],
    durationDays: 365,
    irrigationIntervalDays: 10,
    activities: [
      {
        dayOffset: 0,
        type: "sowing",
        title: "Sett Planting",
        description: "Plant 3-bud setts",
        priority: "high",
      },
      {
        dayOffset: 30,
        type: "fertilizer",
        title: "First Fertilizer",
        description: "Apply Urea + DAP",
        priority: "high",
      },
      {
        dayOffset: 90,
        type: "fertilizer",
        title: "Second Fertilizer",
        description: "Apply 50 kg Urea/acre",
        priority: "high",
      },
      {
        dayOffset: 120,
        type: "task",
        title: "Earthing Up",
        description: "Support canes",
        priority: "high",
      },
      {
        dayOffset: 60,
        type: "irrigation",
        title: "Irrigation",
        description: "Regular 10-day cycle",
        priority: "medium",
      },
      {
        dayOffset: 150,
        type: "irrigation",
        title: "Grand Growth",
        description: "Peak growth irrigation",
        priority: "high",
      },
      {
        dayOffset: 365,
        type: "harvest",
        title: "Harvest",
        description: "Harvest at 10-11 months",
        priority: "high",
      },
    ],
  },
  maize: {
    sowingMonths: [5, 6],
    harvestMonths: [8, 9],
    durationDays: 100,
    irrigationIntervalDays: 12,
    activities: [
      {
        dayOffset: 0,
        type: "sowing",
        title: "Seed Sowing",
        description: "Sow hybrid 8 kg/acre",
        priority: "high",
      },
      {
        dayOffset: 20,
        type: "fertilizer",
        title: "First Fertilizer",
        description: "Apply 40 kg Urea/acre",
        priority: "high",
      },
      {
        dayOffset: 35,
        type: "pesticide",
        title: "Fall Armyworm",
        description: "Scout for FAW",
        priority: "high",
      },
      {
        dayOffset: 40,
        type: "fertilizer",
        title: "Second Fertilizer",
        description: "Knee-high stage",
        priority: "high",
      },
      {
        dayOffset: 50,
        type: "irrigation",
        title: "Pre-tasseling",
        description: "Critical moisture",
        priority: "high",
      },
      {
        dayOffset: 60,
        type: "irrigation",
        title: "Silking",
        description: "Most critical stage",
        priority: "high",
      },
      {
        dayOffset: 100,
        type: "harvest",
        title: "Harvest",
        description: "Harvest when grains hard",
        priority: "high",
      },
    ],
  },
  groundnut: {
    sowingMonths: [5, 6],
    harvestMonths: [9, 10],
    durationDays: 110,
    irrigationIntervalDays: 15,
    activities: [
      {
        dayOffset: 0,
        type: "sowing",
        title: "Seed Sowing",
        description: "Sow 50 kg/acre",
        priority: "high",
      },
      {
        dayOffset: 25,
        type: "fertilizer",
        title: "Gypsum",
        description: "Apply 200 kg gypsum/acre",
        priority: "high",
      },
      {
        dayOffset: 30,
        type: "irrigation",
        title: "Flowering",
        description: "Peak flowering moisture",
        priority: "high",
      },
      {
        dayOffset: 45,
        type: "irrigation",
        title: "Pegging Stage",
        description: "Critical for pegs",
        priority: "high",
      },
      {
        dayOffset: 55,
        type: "pesticide",
        title: "Disease Check",
        description: "Check for leaf spot",
        priority: "medium",
      },
      {
        dayOffset: 110,
        type: "harvest",
        title: "Harvest",
        description: "Harvest at 70% mature pods",
        priority: "high",
      },
    ],
  },
};

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export const handler: Handlers<CalendarPageData, AuthState> = {
  async GET(req, ctx) {
    if (!ctx.state.session || !ctx.state.user) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const url = new URL(req.url);
    const now = new Date();
    const currentMonth = parseInt(
      url.searchParams.get("month") || String(now.getMonth()),
    );
    const currentYear = parseInt(
      url.searchParams.get("year") || String(now.getFullYear()),
    );

    const { session } = ctx.state;
    const farms = await getFarmsByFarmer(session.userId, session.tenantId);

    const farmCrops = await query<{
      farm_id: string;
      farm_name: string;
      crop_type: string;
      sowing_date: Date;
    }>(
      `SELECT f.id as farm_id, f.name as farm_name, cd.crop_type, cd.sowing_date
       FROM farms f
       LEFT JOIN crop_declarations cd ON cd.farm_id = f.id AND cd.is_active = true
       WHERE f.farmer_id = $1 AND f.tenant_id = $2`,
      [session.userId, session.tenantId],
    );

    const tasks: CalendarTask[] = [];
    const farmsData: FarmData[] = [];

    farms.forEach((farm) => {
      const fc = farmCrops.find((c) => c.farm_id === farm.id);
      const sowingDate = fc?.sowing_date ? new Date(fc.sowing_date) : null;
      const daysAfterSowing = sowingDate
        ? Math.floor(
          (now.getTime() - sowingDate.getTime()) / (1000 * 60 * 60 * 24),
        )
        : 0;

      let stage = "Not Planted";
      if (daysAfterSowing > 0) {
        if (daysAfterSowing < 15) stage = "Germination";
        else if (daysAfterSowing < 30) stage = "Seedling";
        else if (daysAfterSowing < 50) stage = "Vegetative";
        else if (daysAfterSowing < 70) stage = "Flowering";
        else if (daysAfterSowing < 90) stage = "Grain Filling";
        else stage = "Maturity";
      }

      farmsData.push({
        id: farm.id,
        name: farm.name,
        cropType: fc?.crop_type || "",
        sowingDate,
        daysAfterSowing,
        stage,
      });

      if (fc?.crop_type && sowingDate && CROP_DATA[fc.crop_type]) {
        const calendar = CROP_DATA[fc.crop_type];
        calendar.activities.forEach((activity, idx) => {
          const taskDate = new Date(sowingDate);
          taskDate.setDate(taskDate.getDate() + activity.dayOffset);

          const taskMonth = taskDate.getMonth();
          const taskYear = taskDate.getFullYear();
          const monthDiff = (taskYear - currentYear) * 12 +
            (taskMonth - currentMonth);

          if (Math.abs(monthDiff) <= 1) {
            tasks.push({
              id: `${farm.id}-${activity.type}-${idx}`,
              date: taskDate.toISOString().split("T")[0],
              type: activity.type,
              title: activity.title,
              description: activity.description,
              farmName: farm.name,
              farmId: farm.id,
              crop: fc.crop_type,
              completed: taskDate < now,
              priority: activity.priority,
            });
          }
        });
      }
    });

    tasks.sort((a, b) => a.date.localeCompare(b.date));

    const todayStr = `${now.getFullYear()}-${
      String(now.getMonth() + 1).padStart(2, "0")
    }-${String(now.getDate()).padStart(2, "0")}`;

    // Build crop guide data
    const cropGuide = Object.entries(CROP_DATA).slice(0, 4).map(
      ([crop, data]) => {
        const cropInfo = CROP_TYPES.find((c) => c.id === crop);
        return {
          crop,
          name: cropInfo?.name || crop,
          sowingMonths: data.sowingMonths.map((m) => MONTH_NAMES[m]).join(", "),
          harvestMonths: data.harvestMonths.map((m) => MONTH_NAMES[m]).join(
            ", ",
          ),
          duration: data.durationDays,
          irrigation: data.irrigationIntervalDays,
        };
      },
    );

    return ctx.render({
      tasks,
      farms: farmsData,
      currentMonth,
      currentYear,
      todayStr,
      cropGuide,
    });
  },
};

export default function CalendarPage({ data }: PageProps<CalendarPageData>) {
  const { tasks, farms, currentMonth, currentYear, todayStr, cropGuide } = data;

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();

  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
  const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;

  const getTasksForDay = (day: number) => {
    const dateStr = `${currentYear}-${
      String(currentMonth + 1).padStart(2, "0")
    }-${String(day).padStart(2, "0")}`;
    return tasks.filter((t) => t.date === dateStr);
  };

  const taskConfig: Record<
    string,
    { color: string; icon: string; bg: string }
  > = {
    sowing: { color: "text-green-700", icon: "🌱", bg: "bg-green-100" },
    harvest: { color: "text-amber-700", icon: "🌾", bg: "bg-amber-100" },
    irrigation: { color: "text-blue-700", icon: "💧", bg: "bg-blue-100" },
    fertilizer: { color: "text-purple-700", icon: "🧪", bg: "bg-purple-100" },
    pesticide: { color: "text-red-700", icon: "🛡️", bg: "bg-red-100" },
    task: { color: "text-gray-700", icon: "📋", bg: "bg-gray-100" },
  };

  const upcomingTasks = tasks.filter((t) => {
    const taskDate = new Date(t.date);
    const today = new Date(todayStr);
    const diffDays = Math.floor(
      (taskDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
    return diffDays >= 0 && diffDays <= 14;
  });

  return (
    <AppShell title="Farm Calendar" showBack>
      <div class="space-y-4">
        {/* Farm Overview */}
        <div class="px-4 pt-4">
          <h2 class="text-sm font-semibold text-gray-600 mb-2">Your Farms</h2>
          <div class="flex gap-3 overflow-x-auto pb-2">
            {farms.map((farm) => (
              <div
                key={farm.id}
                class="flex-shrink-0 w-40 p-3 bg-white rounded-lg border shadow-sm"
              >
                <p class="font-medium text-sm truncate">{farm.name}</p>
                {farm.cropType
                  ? (
                    <>
                      <p class="text-xs text-gray-500 capitalize">
                        {farm.cropType}
                      </p>
                      <p class="text-xs text-primary-600 mt-1">
                        Day {farm.daysAfterSowing} • {farm.stage}
                      </p>
                    </>
                  )
                  : <p class="text-xs text-gray-400 mt-1">No crop planted</p>}
              </div>
            ))}
          </div>
        </div>

        {/* Calendar Header */}
        <div class="flex items-center justify-between px-4 py-2 bg-white border-b">
          <a
            href={`/app/calendar?month=${prevMonth}&year=${prevYear}`}
            class="p-2 hover:bg-gray-100 rounded-lg"
          >
            <svg
              class="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </a>
          <h1 class="text-lg font-bold">
            {monthNames[currentMonth]} {currentYear}
          </h1>
          <a
            href={`/app/calendar?month=${nextMonth}&year=${nextYear}`}
            class="p-2 hover:bg-gray-100 rounded-lg"
          >
            <svg
              class="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </a>
        </div>

        {/* Calendar Grid */}
        <div class="bg-white mx-4 rounded-lg border overflow-hidden">
          <div class="grid grid-cols-7 bg-gray-50 border-b">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div
                key={day}
                class="p-2 text-center text-xs font-semibold text-gray-600"
              >
                {day}
              </div>
            ))}
          </div>
          <div class="grid grid-cols-7">
            {Array.from({ length: firstDayOfMonth }).map((_, i) => (
              <div
                key={`empty-${i}`}
                class="p-2 min-h-[80px] bg-gray-50 border-b border-r"
              />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${currentYear}-${
                String(currentMonth + 1).padStart(2, "0")
              }-${String(day).padStart(2, "0")}`;
              const dayTasks = getTasksForDay(day);
              const isToday = dateStr === todayStr;
              const isPast = new Date(dateStr) < new Date(todayStr);

              return (
                <div
                  key={day}
                  class={`p-1 min-h-[80px] border-b border-r ${
                    isToday
                      ? "bg-primary-50 ring-2 ring-primary-500 ring-inset"
                      : isPast
                      ? "bg-gray-50"
                      : "bg-white"
                  }`}
                >
                  <div
                    class={`text-xs font-semibold mb-1 ${
                      isToday
                        ? "text-primary-700"
                        : isPast
                        ? "text-gray-400"
                        : "text-gray-700"
                    }`}
                  >
                    {day}
                  </div>
                  <div class="space-y-0.5">
                    {dayTasks.slice(0, 3).map((task) => {
                      const cfg = taskConfig[task.type] || taskConfig.task;
                      return (
                        <div
                          key={task.id}
                          class={`text-xs px-1 py-0.5 rounded truncate ${cfg.bg} ${cfg.color}`}
                          title={`${task.farmName}: ${task.title}`}
                        >
                          {cfg.icon} {task.title.slice(0, 10)}
                        </div>
                      );
                    })}
                    {dayTasks.length > 3 && (
                      <div class="text-xs text-gray-500 pl-1">
                        +{dayTasks.length - 3}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Upcoming Tasks */}
        <div class="mx-4 bg-white rounded-lg border p-4">
          <h2 class="text-lg font-semibold mb-3">
            📅 Upcoming Tasks (14 Days)
          </h2>
          {upcomingTasks.length > 0
            ? (
              <div class="space-y-3">
                {upcomingTasks.map((task) => {
                  const cfg = taskConfig[task.type] || taskConfig.task;
                  return (
                    <div
                      key={task.id}
                      class={`p-3 rounded-lg bg-gray-50 border-l-4 ${
                        task.priority === "high"
                          ? "border-red-500"
                          : "border-yellow-500"
                      }`}
                    >
                      <div class="flex items-start justify-between">
                        <div class="flex items-center gap-2">
                          <span class="text-xl">{cfg.icon}</span>
                          <div>
                            <p class="font-medium">{task.title}</p>
                            <p class="text-xs text-gray-500">
                              {task.farmName} • {task.crop} •{" "}
                              {new Date(task.date).toLocaleDateString("en-IN", {
                                weekday: "short",
                                day: "numeric",
                                month: "short",
                              })}
                            </p>
                          </div>
                        </div>
                        <span
                          class={`text-xs px-2 py-0.5 rounded ${
                            task.priority === "high"
                              ? "bg-red-100 text-red-700"
                              : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {task.priority}
                        </span>
                      </div>
                      <p class="text-sm text-gray-600 mt-2 ml-8">
                        {task.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            )
            : (
              <p class="text-gray-500 text-center py-4">
                No upcoming tasks. Add crops to your farms to see
                recommendations.
              </p>
            )}
        </div>

        {/* Task Legend */}
        <div class="mx-4 bg-white rounded-lg border p-4">
          <h3 class="font-semibold mb-3">Task Types</h3>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
            {Object.entries(taskConfig).map(([type, cfg]) => (
              <div key={type} class="flex items-center gap-2 text-sm">
                <span
                  class={`w-6 h-6 flex items-center justify-center rounded ${cfg.bg}`}
                >
                  {cfg.icon}
                </span>
                <span class="capitalize">{type}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Crop Guide */}
        <div class="mx-4 bg-white rounded-lg border p-4 mb-4">
          <h2 class="text-lg font-semibold mb-3">Crop Calendar Guide</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            {cropGuide.map((guide) => (
              <div key={guide.crop} class="p-3 border rounded-lg">
                <div class="flex items-center gap-2 mb-2">
                  <span class="text-lg">🌾</span>
                  <span class="font-medium capitalize">{guide.name}</span>
                </div>
                <div class="text-sm text-gray-600 space-y-1">
                  <p>
                    <span class="font-medium">Sowing:</span>{" "}
                    {guide.sowingMonths}
                  </p>
                  <p>
                    <span class="font-medium">Harvest:</span>{" "}
                    {guide.harvestMonths}
                  </p>
                  <p>
                    <span class="font-medium">Duration:</span> {guide.duration}
                    {" "}
                    days
                  </p>
                  <p>
                    <span class="font-medium">Irrigation:</span> Every{" "}
                    {guide.irrigation} days
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
