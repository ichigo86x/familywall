import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import type { CreateProviderAccountInput, ProviderAccountResponse, ProviderAccountsResponse } from "@familywall/shared";
import { createProviderAccountSchema } from "@familywall/shared";
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

  @Delete(":accountId")
  @HttpCode(HttpStatus.NO_CONTENT)
  public delete(@Param("accountId") accountId: string): void {
    this.providersService.delete(accountId);
  }
}
