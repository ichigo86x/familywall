import { Controller, Get } from "@nestjs/common";
import type { HealthResponse } from "@familywall/shared";
import { Public } from "../../common/auth/public.decorator";
import { HealthService } from "./health.service";

@Controller("health")
export class HealthController {
  public constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  public getHealth(): HealthResponse {
    return this.healthService.getHealth();
  }
}
