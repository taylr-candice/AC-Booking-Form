/**
 * Shared types used to wire the admin shell to its per-screen views.
 */

export type ViewId =
  | "bookings"
  | "payments"
  | "awaiting_coordination"
  | "rollouts"
  | "maintenance_calendar"
  | "buildings"
  | "units"
  | "services"
  | "agents"
  | "email_templates"
  | "call_templates";
