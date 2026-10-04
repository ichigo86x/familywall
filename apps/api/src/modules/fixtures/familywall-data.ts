import type { DashboardData } from "@familywall/shared";

/** Placeholder content until the dashboard gets its own persistence. */
export const dashboardData: DashboardData = {
  householdName: "",
  focusDateLabel: "",
  weather: {
    temperatureC: 0,
    condition: "",
    note: ""
  },
  agenda: [],
  routines: [],
  reminders: []
};
