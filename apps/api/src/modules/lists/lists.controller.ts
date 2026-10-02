import { Controller, Get } from "@nestjs/common";
import type { ListsResponse } from "@familywall/shared";
import { ListsService } from "./lists.service";

@Controller("lists")
export class ListsController {
  public constructor(private readonly listsService: ListsService) {}

  @Get()
  public getLists(): ListsResponse {
    return this.listsService.getLists();
  }
}
