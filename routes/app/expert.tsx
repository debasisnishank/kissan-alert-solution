import { Handlers, PageProps } from "$fresh/server.ts";
import { AppShell } from "$components/Layout.tsx";
import { query } from "$db/client.ts";
import type { AuthState } from "../../middlewares/auth.ts";
import ExpertTicketForm from "$islands/ExpertTicketForm.tsx";

interface TicketData {
  id: string;
  subject: string;
  category: string;
  status: string;
  createdAt: string;
}

interface ExpertPageData {
  tickets: TicketData[];
}

export const handler: Handlers<ExpertPageData, AuthState> = {
  async GET(_req, ctx) {
    if (!ctx.state.session) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const tickets = await query<{
      id: string;
      subject: string;
      category: string;
      status: string;
      created_at: Date;
    }>(
      `SELECT id, subject, category, status, created_at
       FROM expert_tickets
       WHERE farmer_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [ctx.state.session.userId],
    );

    return ctx.render({
      tickets: tickets.map((t) => ({
        id: t.id,
        subject: t.subject,
        category: t.category,
        status: t.status,
        createdAt: new Date(t.created_at).toLocaleDateString("en-IN"),
      })),
    });
  },
};

export default function ExpertPage({ data }: PageProps<ExpertPageData>) {
  const { tickets } = data;

  const statusColors: Record<string, string> = {
    open: "bg-yellow-100 text-yellow-700",
    in_progress: "bg-blue-100 text-blue-700",
    resolved: "bg-green-100 text-green-700",
    closed: "bg-gray-100 text-gray-700",
  };

  return (
    <AppShell title="Ask an Expert" showBack>
      {/* New Ticket Form */}
      <div class="bg-white rounded-xl border border-gray-100 p-4 mb-6">
        <h2 class="font-semibold text-gray-900 mb-3">
          Have a question? Ask our experts
        </h2>
        <ExpertTicketForm />
      </div>

      {/* Previous Tickets */}
      <h2 class="font-semibold text-gray-900 mb-3">Your Questions</h2>
      {tickets.length > 0
        ? (
          <div class="space-y-3">
            {tickets.map((ticket) => (
              <a
                key={ticket.id}
                href={`/app/expert/${ticket.id}`}
                class="block bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md transition-shadow"
              >
                <div class="flex items-start justify-between mb-1">
                  <h3 class="font-medium text-gray-900 line-clamp-1">
                    {ticket.subject}
                  </h3>
                  <span
                    class={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      statusColors[ticket.status] || statusColors.open
                    }`}
                  >
                    {ticket.status.replace("_", " ")}
                  </span>
                </div>
                <div class="flex items-center gap-3 text-xs text-gray-500">
                  <span class="capitalize">{ticket.category}</span>
                  <span>•</span>
                  <span>{ticket.createdAt}</span>
                </div>
              </a>
            ))}
          </div>
        )
        : (
          <div class="bg-gray-50 rounded-xl p-6 text-center">
            <p class="text-sm text-gray-500">
              No questions yet. Ask your first question above!
            </p>
          </div>
        )}
    </AppShell>
  );
}
