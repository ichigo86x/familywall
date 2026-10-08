import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import type { CreateProviderAccountInput, IcloudCodeInput, ProviderAccountResponse, ProviderAccountsResponse } from "@familywall/shared";
import { createProviderAccountSchema, icloudCodeSchema } from "@familywall/shared";
import { RequirePermission } from "../../common/auth/permissions.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { ProvidersService } from "./providers.service";

@Controller("providers/accounts")
@RequirePermission("providers:manage")
export class ProvidersController {
  public constructor(private readonly providersService: ProvidersService) {}

  @Get()
  public list(): ProviderAccountsResponse {
    return { accounts: this.providersService.list() };
  }

  @Post()
  public async create(
    @Body(new ZodValidationPipe(createProviderAccountSchema)) input: CreateProviderAccountInput
  ): Promise<ProviderAccountResponse> {
    return { account: await this.providersService.create(input) };
  }

  /** iCloud Reminders: the two-factor code shown on the Apple devices. */
  @Post(":accountId/icloud/verify")
  public async verifyIcloud(@Param("accountId") accountId: string, @Body(new ZodValidationPipe(icloudCodeSchema)) input: IcloudCodeInput): Promise<ProviderAccountResponse> {
    return { account: await this.providersService.verifyIcloud(accountId, input.code) };
  }

  /** iCloud Reminders: opens the session again (and asks a new code when Apple wants one). */
  @Post(":accountId/icloud/reconnect")
  public async reconnectIcloud(@Param("accountId") accountId: string): Promise<ProviderAccountResponse> {
    return { account: await this.providersService.reconnectIcloud(accountId) };
  }

  @Delete(":accountId")
  @HttpCode(HttpStatus.NO_CONTENT)
  public delete(@Param("accountId") accountId: string): void {
    this.providersService.delete(accountId);
  }
}
