import type { Request } from "express";
import type { User } from "@familywall/shared";

export interface RequestWithUser extends Request {
  user: User;
}