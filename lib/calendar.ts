/**
 * Farm Calendar Management
 * Auto-generates calendar events based on crop templates
 */

import { query, queryOne } from "$db/client.ts";

interface CalendarEvent {
  id: string;
  farmId: string;
  cropId: string | null;
  title: string;
  description: string | null;
  eventType: string;
  eventDate: Date;
  status: string;
  priority: string;
}

interface CalendarTemplate {
  cropType: string;
  eventType: string;
  title: string;
  description: string | null;
  dayOffset: number;
  priority: string;
}

/**
 * Get calendar templates for a crop type from database
 */
export async function getCalendarTemplates(
  cropType: string,
): Promise<CalendarTemplate[]> {
  const templates = await query<{
    crop_type: string;
    event_type: string;
    title: string;
    description: string | null;
    day_offset: number;
    priority: string;
  }>(
    `SELECT crop_type, event_type, title, description, day_offset, priority 
     FROM crop_calendar_templates 
     WHERE crop_type = $1 
     ORDER BY day_offset ASC`,
    [cropType.toLowerCase()],
  );

  return templates.map((t) => ({
    cropType: t.crop_type,
    eventType: t.event_type,
    title: t.title,
    description: t.description,
    dayOffset: t.day_offset,
    priority: t.priority,
  }));
}

/**
 * Generate calendar events for a new crop
 */
export async function generateCalendarEventsForCrop(params: {
  farmId: string;
  cropId: string;
  cropType: string;
  sowingDate: Date;
}): Promise<CalendarEvent[]> {
  const { farmId, cropId, cropType, sowingDate } = params;

  // Get templates for this crop
  let templates = await getCalendarTemplates(cropType);

  // If no templates in DB, use fallback
  if (templates.length === 0) {
    templates = getDefaultTemplates(cropType);
  }

  const events: CalendarEvent[] = [];

  for (const template of templates) {
    const eventDate = new Date(sowingDate);
    eventDate.setDate(eventDate.getDate() + template.dayOffset);

    try {
      const result = await queryOne<{ id: string }>(
        `INSERT INTO farm_calendar_events 
         (farm_id, crop_id, title, description, event_type, event_date, priority, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'scheduled')
         RETURNING id`,
        [
          farmId,
          cropId,
          template.title,
          template.description,
          template.eventType,
          eventDate.toISOString().split("T")[0],
          template.priority,
        ],
      );

      if (result) {
        events.push({
          id: result.id,
          farmId,
          cropId,
          title: template.title,
          description: template.description,
          eventType: template.eventType,
          eventDate,
          status: "scheduled",
          priority: template.priority,
        });
      }
    } catch (error) {
      console.error(
        `[Calendar] Failed to create event: ${template.title}`,
        error,
      );
    }
  }

  return events;
}

/**
 * Get calendar events for a farm
 */
export async function getFarmCalendarEvents(
  farmId: string,
  options: {
    startDate?: Date;
    endDate?: Date;
    status?: string;
  } = {},
): Promise<CalendarEvent[]> {
  const { startDate, endDate, status } = options;

  let whereClause = "farm_id = $1";
  const params: unknown[] = [farmId];

  if (startDate) {
    params.push(startDate.toISOString().split("T")[0]);
    whereClause += ` AND event_date >= $${params.length}`;
  }

  if (endDate) {
    params.push(endDate.toISOString().split("T")[0]);
    whereClause += ` AND event_date <= $${params.length}`;
  }

  if (status) {
    params.push(status);
    whereClause += ` AND status = $${params.length}`;
  }

  const events = await query<{
    id: string;
    farm_id: string;
    crop_id: string | null;
    title: string;
    description: string | null;
    event_type: string;
    event_date: Date;
    status: string;
    priority: string;
  }>(
    `SELECT id, farm_id, crop_id, title, description, event_type, event_date, status, priority
     FROM farm_calendar_events 
     WHERE ${whereClause}
     ORDER BY event_date ASC`,
    params,
  );

  return events.map((e) => ({
    id: e.id,
    farmId: e.farm_id,
    cropId: e.crop_id,
    title: e.title,
    description: e.description,
    eventType: e.event_type,
    eventDate: e.event_date,
    status: e.status,
    priority: e.priority,
  }));
}

/**
 * Update event status
 */
export async function updateEventStatus(
  eventId: string,
  status: "scheduled" | "completed" | "skipped",
): Promise<boolean> {
  try {
    await query(
      `UPDATE farm_calendar_events 
       SET status = $1, 
           completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE NULL END,
           updated_at = NOW()
       WHERE id = $2`,
      [status, eventId],
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Default templates for crops not in database
 */
function getDefaultTemplates(cropType: string): CalendarTemplate[] {
  const defaultTemplates: Record<string, CalendarTemplate[]> = {
    rice: [
      {
        cropType: "rice",
        eventType: "sowing",
        title: "Transplanting",
        description: "Transplant seedlings from nursery",
        dayOffset: 0,
        priority: "high",
      },
      {
        cropType: "rice",
        eventType: "fertilizer",
        title: "First Urea Application",
        description: "Apply urea for nitrogen",
        dayOffset: 21,
        priority: "high",
      },
      {
        cropType: "rice",
        eventType: "fertilizer",
        title: "Second Fertilizer",
        description: "Apply NPK mixture",
        dayOffset: 45,
        priority: "high",
      },
      {
        cropType: "rice",
        eventType: "pesticide",
        title: "Pest Check",
        description: "Monitor for pests",
        dayOffset: 60,
        priority: "medium",
      },
      {
        cropType: "rice",
        eventType: "harvest",
        title: "Harvest",
        description: "Harvest rice crop",
        dayOffset: 120,
        priority: "high",
      },
    ],
    wheat: [
      {
        cropType: "wheat",
        eventType: "sowing",
        title: "Sowing",
        description: "Sow wheat seeds",
        dayOffset: 0,
        priority: "high",
      },
      {
        cropType: "wheat",
        eventType: "irrigation",
        title: "First Irrigation",
        description: "Crown root initiation irrigation",
        dayOffset: 21,
        priority: "high",
      },
      {
        cropType: "wheat",
        eventType: "fertilizer",
        title: "Urea Top Dressing",
        description: "Apply urea after irrigation",
        dayOffset: 25,
        priority: "high",
      },
      {
        cropType: "wheat",
        eventType: "irrigation",
        title: "Second Irrigation",
        description: "Tillering stage irrigation",
        dayOffset: 45,
        priority: "high",
      },
      {
        cropType: "wheat",
        eventType: "harvest",
        title: "Harvest",
        description: "Harvest wheat crop",
        dayOffset: 140,
        priority: "high",
      },
    ],
    cotton: [
      {
        cropType: "cotton",
        eventType: "sowing",
        title: "Sowing",
        description: "Sow cotton seeds",
        dayOffset: 0,
        priority: "high",
      },
      {
        cropType: "cotton",
        eventType: "fertilizer",
        title: "First Fertilizer",
        description: "Apply DAP",
        dayOffset: 20,
        priority: "high",
      },
      {
        cropType: "cotton",
        eventType: "pesticide",
        title: "Bollworm Management",
        description: "Monitor and spray",
        dayOffset: 45,
        priority: "high",
      },
      {
        cropType: "cotton",
        eventType: "harvest",
        title: "First Picking",
        description: "Pick opened bolls",
        dayOffset: 150,
        priority: "high",
      },
    ],
  };

  // Return templates for specific crop or generic default
  return defaultTemplates[cropType.toLowerCase()] || [
    {
      cropType,
      eventType: "sowing",
      title: "Sowing",
      description: "Plant seeds",
      dayOffset: 0,
      priority: "high",
    },
    {
      cropType,
      eventType: "fertilizer",
      title: "Fertilizer Application",
      description: "Apply fertilizer",
      dayOffset: 21,
      priority: "medium",
    },
    {
      cropType,
      eventType: "irrigation",
      title: "Irrigation Check",
      description: "Check irrigation needs",
      dayOffset: 30,
      priority: "medium",
    },
    {
      cropType,
      eventType: "harvest",
      title: "Harvest",
      description: "Harvest crop",
      dayOffset: 120,
      priority: "high",
    },
  ];
}

export type { CalendarEvent, CalendarTemplate };
