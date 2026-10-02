import { Controller, Get } from "@nestjs/common";
import type { DashboardResponse } from "@familywall/shared";
import { DashboardService } from "./dashboard.service";

@Controller("dashboard")
export class DashboardController {
  public constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  public getDashboard(): DashboardResponse {
    return this.dashboardService.getDashboard();
  }
}
