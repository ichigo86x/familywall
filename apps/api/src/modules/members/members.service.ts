import { Injectable } from "@nestjs/common";
import type { CreateMemberInput, SetAvatarInput, SetPasswordInput, UpdateMemberInput, User } from "@familywall/shared";
import { hasPermission } from "@familywall/shared";
import { hashPassword, verifyPassword } from "../../common/crypto/password";
import { AppException } from "../../common/errors/app-exception";
import { MembersRepository, NO_PASSWORD, toUser } from "./members.repository";

@Injectable()
export class MembersService {
  public constructor(private readonly members: MembersRepository) {}

  public list(): User[] {
    return this.members.list();
  }

  public async create(input: CreateMemberInput): Promise<User> {
    if (this.members.findByUsername(input.username)) {
      throw AppException.conflict("Nome utente già in uso.");
    }

    return toUser(
      this.members.insert({
        username: input.username,
        displayName: input.displayName,
        role: input.role,
        color: input.color,
        keywords: input.keywords,
        panelWrite: input.panelWrite,
        passwordHash: input.loginEnabled !== false && input.password ? await hashPassword(input.password) : NO_PASSWORD
      })
    );
  }

  public update(actor: User, memberId: string, input: UpdateMemberInput): User {
    const current = this.requireMember(memberId);
    const losesAdmin =
      current.role === "Admin" &&
      current.disabled === 0 &&
      ((input.role !== undefined && input.role !== "Admin") || input.disabled === true);

    if (losesAdmin && this.members.countActiveAdmins() <= 1) {
      throw AppException.conflict("Serve almeno un Admin attivo.");
    }

    if (actor.id === memberId && input.disabled === true) {
      throw AppException.conflict("Non puoi disattivare il tuo account.");
    }

    const tagOnly = input.loginEnabled === false || current.password_hash === NO_PASSWORD;
    if (tagOnly && (input.role ?? current.role) !== "Child") {
      throw AppException.conflict("Solo i figli possono essere senza accesso: imposta prima una password.");
    }

    return toUser(this.members.update(memberId, input));
  }

  /** Members change their own password with the current one; Admins can reset anyone's. */
  public async setPassword(actor: User, memberId: string, input: SetPasswordInput): Promise<void> {
    const target = this.requireMember(memberId);
    const isSelf = actor.id === memberId;

    if (!isSelf && !hasPermission(actor.role, "members:manage")) {
      throw AppException.forbidden("Puoi cambiare solo la tua password.");
    }

    if (isSelf && !(input.currentPassword && (await verifyPassword(input.currentPassword, target.password_hash)))) {
      throw AppException.unauthorized("La password attuale non è corretta.");
    }

    this.members.setPassword(memberId, await hashPassword(input.password));
  }

  /** Members change their own picture; Admins can change anyone's (children have no sign-in). */
  public setAvatar(actor: User, memberId: string, input: SetAvatarInput): User {
    this.requireMember(memberId);
    if (actor.id !== memberId && !hasPermission(actor.role, "members:manage")) {
      throw AppException.forbidden("Puoi cambiare solo la tua foto.");
    }
    this.members.setAvatar(memberId, input.avatar);
    return toUser(this.requireMember(memberId));
  }

  public delete(actor: User, memberId: string): void {
    const target = this.requireMember(memberId);

    if (actor.id === memberId) {
      throw AppException.conflict("Non puoi eliminare il tuo account.");
    }

    if (target.role === "Admin" && target.disabled === 0 && this.members.countActiveAdmins() <= 1) {
      throw AppException.conflict("Serve almeno un Admin attivo.");
    }

    this.members.delete(memberId);
  }

  private requireMember(memberId: string) {
    const member = this.members.findById(memberId);
    if (!member) {
      throw AppException.notFound("Membro non trovato.");
    }
    return member;
  }
}
