import { Controller, Get, HttpCode, HttpStatus, Param, Post, Req } from "@nestjs/common";
import type { HomeButtonsResponse, HomeEntity, HomePresenceResponse } from "@familywall/shared";
import { RequirePermission } from "../../common/auth/permissions.decorator";
import type { RequestWithUser } from "../../common/types/request-with-user";
import { HomeService } from "./home.service";

/** Home Assistant shortcuts: each button lists the roles allowed to use it. */
@Controller("home")
export class HomeController {
  public constructor(private readonly home: HomeService) {}

  @Get("buttons")
  @RequirePermission("calendar:read")
  public buttons(@Req() request: RequestWithUser): Promise<HomeButtonsResponse> {
    return this.home.buttons(request.user);
  }

  @Post("buttons/:id/run")
  @RequirePermission("calendar:read")
  @HttpCode(HttpStatus.NO_CONTENT)
  public run(@Req() request: RequestWithUser, @Param("id") id: string): Promise<void> {
    return this.home.run(request.user, id);
  }

  /** Whether Familywall can reach Home Assistant (the Admin hides the Home Assistant cards otherwise). */
  @Get("status")
  @RequirePermission("calendar:read")
  public status(): { available: boolean } {
    return { available: this.home.available };
  }

  @Get("presence")
  @RequirePermission("calendar:read")
  public presence(): Promise<HomePresenceResponse> {
    return this.home.presence();
  }

  @Get("person-entities")
  @RequirePermission("settings:manage")
  public async personEntities(): Promise<{ entities: HomeEntity[] }> {
    return { entities: await this.home.personEntities() };
  }

  @Get("calendar-entities")
  @RequirePermission("settings:manage")
  public async calendarEntities(): Promise<{ entities: HomeEntity[] }> {
    return { entities: await this.home.calendarEntities() };
  }

  @Get("todo-entities")
  @RequirePermission("settings:manage")
  public async todoEntities(): Promise<{ entities: HomeEntity[] }> {
    return { entities: await this.home.todoEntities() };
  }

  @Get("entities")
  @RequirePermission("settings:manage")
  public async entities(): Promise<{ entities: HomeEntity[] }> {
    return { entities: await this.home.entities() };
  }
}
