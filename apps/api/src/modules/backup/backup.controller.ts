import { Body, Controller, Get, Param, Post, Put, Query, Req, Res } from "@nestjs/common";
import { remoteBackupSchema, type RemoteBackupInput, type RemoteBackupStatus } from "@familywall/shared";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { RemoteBackupService } from "./remote-backup.service";
import type { Request, Response } from "express";
import { RequirePermission } from "../../common/auth/permissions.decorator";
import { AppException } from "../../common/errors/app-exception";
import { DavStore } from "../dav/dav-store";
import { LegacyDataMigration } from "../dav/legacy-migration";
import { BackupService, type RestoreSummary, type StoredBackup } from "./backup.service";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

const sendBackup = (response: Response, name: string, body: Buffer) => {
  response.setHeader("Content-Type", "application/gzip");
  response.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  response.setHeader("Cache-Control", "no-store");
  response.end(body);
};

/** Read the raw upload (the JSON body parser does not touch application/octet-stream). */
const readBody = (request: Request): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_UPLOAD_BYTES) {
        reject(AppException.validation("Il file è troppo grande."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });

@Controller("backup")
@RequirePermission("settings:manage")
export class BackupController {
  public constructor(
    private readonly backup: BackupService,
    private readonly dav: DavStore,
    private readonly migration: LegacyDataMigration,
    private readonly remote: RemoteBackupService
  ) {}

  @Get("remote")
  public remoteStatus(): RemoteBackupStatus {
    return this.remote.status();
  }

  @Put("remote")
  public updateRemote(@Body(new ZodValidationPipe(remoteBackupSchema)) input: RemoteBackupInput): RemoteBackupStatus {
    return this.remote.update(input);
  }

  @Post("remote/run")
  public runRemote(): Promise<RemoteBackupStatus> {
    return this.remote.run(true);
  }

  @Get("download")
  public download(@Query("key") key: string | undefined, @Res() response: Response): void {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
    sendBackup(response, `familywall-${stamp}.fwbackup`, this.backup.create({ includeKey: key === "1" }));
  }

  @Get("stored")
  public stored(): { backups: StoredBackup[] } {
    return { backups: this.backup.listStored() };
  }

  @Get("stored/:name")
  public storedFile(@Param("name") name: string, @Res() response: Response): void {
    sendBackup(response, name, this.backup.readStored(name));
  }

  @Post("restore")
  public async restore(@Req() request: Request): Promise<RestoreSummary> {
    const passphrase = request.headers["x-backup-passphrase"];
    const summary = this.backup.restore(await readBody(request), typeof passphrase === "string" ? decodeURIComponent(passphrase) : undefined);
    this.dav.clearCache();
    // Backups made before 0.4 keep menu, birthdays, shifts and notes in the database: move them now.
    if (this.dav.enabled && this.migration.pending() > 0) {
      try {
        await this.migration.run();
      } catch (error) {
        throw AppException.providerError(`Backup ripristinato, ma lo spostamento dei dati sul server CalDAV non è riuscito: ${error instanceof Error ? error.message : String(error)}. Verrà ritentato al prossimo avvio.`);
      }
    }
    return summary;
  }
}
