import type { DashboardData, FamilyList, ListTask } from "@familywall/shared";

/** Placeholder content until dashboard and lists get their own persistence. */
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

export const familyLists: FamilyList[] = [];

export const listTasks: ListTask[] = [];
