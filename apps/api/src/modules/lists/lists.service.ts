import { Injectable } from "@nestjs/common";
import type { ListsResponse } from "@familywall/shared";
import { familyLists, listTasks } from "../fixtures/familywall-data";

@Injectable()
export class ListsService {
  public getLists(): ListsResponse {
    return {
      lists: familyLists,
      items: listTasks
    };
  }
}