import { Inject, Injectable } from "@nestjs/common";
import type { TotpEnabledResponse, TotpSetupResponse } from "@familywall/shared";
import { verifyPassword } from "../../common/crypto/password";
import { SECRET_BOX, SecretBox } from "../../common/crypto/secret-box";
import { generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, matchTotp, otpauthUrl } from "../../common/crypto/totp";
import { AppException } from "../../common/errors/app-exception";
import { MembersRepository, NO_PASSWORD, type MemberRow } from "../members/members.repository";
import { SettingsRepository } from "../settings/settings.repository";

/** Two-step sign-in with an authenticator app (codes that change every 30 seconds) and recovery codes. */
@Injectable()
export class TotpService {
  public constructor(
    @Inject(SECRET_BOX) private readonly secrets: SecretBox,
    private readonly members: MembersRepository,
    private readonly settings: SettingsRepository
  ) {}

  /** Checks a code at sign-in: an app code not used before, or an unused recovery code (then spent). */
  public verify(member: MemberRow, code: string, now = Date.now()): boolean {
    if (member.totp_enabled !== 1 || !member.totp_secret_enc) {
      return false;
    }
    if (/^\d{6}$/.test(code)) {
      const step = matchTotp(this.secrets.decrypt(member.totp_secret_enc), code, now);
      if (step === null || step <= member.totp_last_step) {
        return false;
      }
      this.members.recordTotpUse(member.id, step);
      return true;
    }
    const hashes = JSON.parse(member.totp_recovery) as string[];
    const hash = hashRecoveryCode(code);
    if (!hashes.includes(hash)) {
      return false;
    }
    this.members.recordTotpUse(member.id, null, hashes.filter((entry) => entry !== hash));
    return true;
  }

  public setup(memberId: string): TotpSetupResponse {
    const member = this.requireMember(memberId);
    if (member.totp_enabled === 1) {
      throw AppException.conflict("La verifica in due passaggi è già attiva.");
    }
    const secret = generateTotpSecret();
    this.members.setTotpPending(member.id, this.secrets.encrypt(secret));
    return { secret, otpauthUrl: otpauthUrl(secret, `${this.settings.get().householdName} (${member.username})`, "Familywall") };
  }

  public enable(memberId: string, code: string, now = Date.now()): TotpEnabledResponse {
    const member = this.requireMember(memberId);
    if (!member.totp_pending_enc) {
      throw AppException.validation("Prepara prima l'app di autenticazione.");
    }
    const secret = this.secrets.decrypt(member.totp_pending_enc);
    const step = matchTotp(secret, code, now);
    if (step === null) {
      throw AppException.validation("Codice non valido: controlla l'ora del telefono e riprova.");
    }
    const recoveryCodes = generateRecoveryCodes();
    this.members.enableTotp(member.id, this.secrets.encrypt(secret), step, recoveryCodes.map(hashRecoveryCode));
    return { recoveryCodes };
  }

  /** Turning it off asks for the password and a code, so a forgotten open session is not enough. */
  public async disable(memberId: string, password: string, code: string): Promise<void> {
    const member = this.requireMember(memberId);
    if (member.totp_enabled !== 1) {
      return;
    }
    if (!(await verifyPassword(password, member.password_hash)) || !this.verify(member, code)) {
      throw AppException.validation("Password o codice non corretti.");
    }
    this.members.disableTotp(member.id);
  }

  /** An Admin turns it off for someone who lost the phone and the recovery codes. */
  public reset(memberId: string): void {
    this.requireMember(memberId);
    this.members.disableTotp(memberId);
  }

  private requireMember(memberId: string): MemberRow {
    const member = this.members.findById(memberId);
    if (!member || member.password_hash === NO_PASSWORD || member.role === "Kiosk") {
      throw AppException.forbidden("La verifica in due passaggi non è disponibile per questo account.");
    }
    return member;
  }
}
