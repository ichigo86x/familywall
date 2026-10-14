import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Req } from "@nestjs/common";
import type {
  CreateMemberInput,
  MemberResponse,
  MembersResponse,
  SetAvatarInput,
  SetPasswordInput,
  UpdateMemberInput
} from "@familywall/shared";
import { createMemberSchema, setAvatarSchema, setPasswordSchema, updateMemberSchema } from "@familywall/shared";
import { RequirePermission } from "../../common/auth/permissions.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { RequestWithUser } from "../../common/types/request-with-user";
import { MembersService } from "./members.service";

@Controller("members")
export class MembersController {
  public constructor(private readonly membersService: MembersService) {}

  /** Every signed-in member needs names and colors to render the calendar. */
  @Get()
  @RequirePermission("calendar:read")
  public list(): MembersResponse {
    return { members: this.membersService.list() };
  }

  @Post()
  @RequirePermission("members:manage")
  public async create(@Body(new ZodValidationPipe(createMemberSchema)) input: CreateMemberInput): Promise<MemberResponse> {
    return { member: await this.membersService.create(input) };
  }

  @Patch(":memberId")
  @RequirePermission("members:manage")
  public update(
    @Req() request: RequestWithUser,
    @Param("memberId") memberId: string,
    @Body(new ZodValidationPipe(updateMemberSchema)) input: UpdateMemberInput
  ): MemberResponse {
    return { member: this.membersService.update(request.user, memberId, input) };
  }

  @Put(":memberId/password")
  @HttpCode(HttpStatus.NO_CONTENT)
  public async setPassword(
    @Req() request: RequestWithUser,
    @Param("memberId") memberId: string,
    @Body(new ZodValidationPipe(setPasswordSchema)) input: SetPasswordInput
  ): Promise<void> {
    await this.membersService.setPassword(request.user, memberId, input);
  }

  @Put(":memberId/avatar")
  public setAvatar(
    @Req() request: RequestWithUser,
    @Param("memberId") memberId: string,
    @Body(new ZodValidationPipe(setAvatarSchema)) input: SetAvatarInput
  ): MemberResponse {
    return { member: this.membersService.setAvatar(request.user, memberId, input) };
  }

  @Delete(":memberId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("members:manage")
  public delete(@Req() request: RequestWithUser, @Param("memberId") memberId: string): void {
    this.membersService.delete(request.user, memberId);
  }
}
