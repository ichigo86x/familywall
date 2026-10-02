import { Injectable } from "@nestjs/common";
import type { DashboardResponse } from "@familywall/shared";
import { dashboardData } from "../fixtures/familywall-data";
import { SettingsRepository } from "../settings/settings.repository";

@Injectable()
export class DashboardService {
  public constructor(private readonly settings: SettingsRepository) {}

  public getDashboard(): DashboardResponse {
    return {
      dashboard: { ...dashboardData, householdName: this.settings.get().householdName }
    };
  }
}
