import { Inject, Injectable } from "@nestjs/common";
import jwt, { type SignOptions } from "jsonwebtoken";
import type { AuthSession, LoginInput, SetupInput, User } from "@familywall/shared";
import { hashPassword, verifyPassword } from "../../common/crypto/password";
import { AppException } from "../../common/errors/app-exception";
import { appConfig } from "../../config/app-config";
import { DATABASE, transaction, type Database } from "../../database/database";
import { MembersRepository, toUser, type MemberRow } from "../members/members.repository";
import { SettingsRepository } from "../settings/settings.repository";
import { LoginThrottle } from "./login-throttle";

export const JWT_SECRET = Symbol("JWT_SECRET");

interface JwtPayload {
  sub: string;
  ver: number;
}

@Injectable()
export class AuthService {
  private readonly throttle = new LoginThrottle();

  public constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(JWT_SECRET) private readonly jwtSecret: Buffer,
    private readonly members: MembersRepository,
    private readonly settings: SettingsRepository
  ) {}

  public needsSetup(): boolean {
    return this.members.count() === 0;
  }

  /** First-run only: creates the initial Admin. Closed as soon as any member exists. */
  public async setup(input: SetupInput): Promise<AuthSession> {
    const passwordHash = await hashPassword(input.password);
    const member = transaction(this.db, () => {
      if (this.members.count() > 0) {
        throw AppException.conflict("La configurazione iniziale è già stata completata.");
      }

      this.settings.update({ householdName: input.householdName });
      return this.members.insert({
        username: input.username,
        displayName: input.displayName,
        role: "Admin",
        color: input.color,
        passwordHash
      });
    });

    return this.toSession(member);
  }

  public async login(input: LoginInput, clientIp: string): Promise<AuthSession> {
    const keys = [`ip:${clientIp}`, `user:${input.username}`];
    if (this.throttle.isBlocked(keys)) {
      throw AppException.tooManyRequests("Troppi tentativi falliti. Riprova tra qualche minuto.");
    }

    const member = this.members.findByUsername(input.username);
    const valid = member ? await verifyPassword(input.password, member.password_hash) : false;

    if (!member || !valid || member.disabled === 1) {
      this.throttle.recordFailure(keys);
      throw AppException.unauthorized("Utente o password non corretti.");
    }

    this.throttle.reset(keys);
    return this.toSession(member);
  }

  public authenticateToken(token: string): User {
    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, this.jwtSecret, {
        issuer: appConfig.jwtIssuer,
        audience: appConfig.jwtAudience,
        algorithms: ["HS256"]
      }) as unknown as JwtPayload;
    } catch {
      throw AppException.unauthorized("Sessione scaduta: accedi di nuovo.");
    }

    const member = this.members.findById(payload.sub);
    if (!member || member.disabled === 1 || member.token_version !== payload.ver) {
      throw AppException.unauthorized("Sessione non più valida: accedi di nuovo.");
    }

    return toUser(member);
  }

  private toSession(member: MemberRow): AuthSession {
    const options: SignOptions = {
      issuer: appConfig.jwtIssuer,
      audience: appConfig.jwtAudience,
      expiresIn: appConfig.jwtExpiresIn as SignOptions["expiresIn"],
      algorithm: "HS256"
    };
    const payload: JwtPayload = { sub: member.id, ver: member.token_version };

    return {
      user: toUser(member),
      token: jwt.sign(payload, this.jwtSecret, options)
    };
  }
}
