import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Req } from "@nestjs/common";
import type { NoteResponse, NotesResponse, UpdateNoteInput } from "@familywall/shared";
import { noteSchema, updateNoteSchema } from "@familywall/shared";
import type { z } from "zod";
import { RequirePermission } from "../../common/auth/permissions.decorator";
import { AppException } from "../../common/errors/app-exception";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { RequestWithUser } from "../../common/types/request-with-user";
import { NotesStore } from "../dav/family-stores";

/** The family notes board, kept on the built-in CalDAV server ("Note" collection). */
@Controller("notes")
export class NotesController {
  public constructor(private readonly notes: NotesStore) {}

  @Get()
  @RequirePermission("calendar:read")
  public async list(): Promise<NotesResponse> {
    return { notes: await this.notes.list() };
  }

  @Post()
  @RequirePermission("lists:write")
  public async create(@Req() request: RequestWithUser, @Body(new ZodValidationPipe(noteSchema)) input: z.output<typeof noteSchema>): Promise<NoteResponse> {
    if (!input.title.trim() && !input.body.trim()) {
      throw AppException.validation("La nota è vuota.");
    }
    return { note: await this.notes.create({ ...input, createdBy: request.user.id }) };
  }

  @Patch(":noteId")
  @RequirePermission("lists:write")
  public async update(@Param("noteId") noteId: string, @Body(new ZodValidationPipe(updateNoteSchema)) input: UpdateNoteInput): Promise<NoteResponse> {
    const current = await this.notes.find(noteId);
    if (!current) {
      throw AppException.notFound("Nota non trovata.");
    }
    return { note: await this.notes.update(noteId, { ...current, ...input }) };
  }

  @Delete(":noteId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("lists:write")
  public async delete(@Param("noteId") noteId: string): Promise<void> {
    await this.notes.delete(noteId);
  }
}
