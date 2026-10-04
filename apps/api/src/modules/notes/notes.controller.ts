import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Req } from "@nestjs/common";
import type { NoteResponse, NotesResponse, UpdateNoteInput } from "@familywall/shared";
import { noteSchema, updateNoteSchema } from "@familywall/shared";
import type { z } from "zod";
import { RequirePermission } from "../../common/auth/permissions.decorator";
import { AppException } from "../../common/errors/app-exception";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { RequestWithUser } from "../../common/types/request-with-user";
import { NotesRepository } from "./notes.repository";

@Controller("notes")
export class NotesController {
  public constructor(private readonly notes: NotesRepository) {}

  @Get()
  @RequirePermission("calendar:read")
  public list(): NotesResponse {
    return { notes: this.notes.list() };
  }

  @Post()
  @RequirePermission("lists:write")
  public create(@Req() request: RequestWithUser, @Body(new ZodValidationPipe(noteSchema)) input: z.output<typeof noteSchema>): NoteResponse {
    if (!input.title.trim() && !input.body.trim()) {
      throw AppException.validation("La nota è vuota.");
    }
    return { note: this.notes.insert(input, request.user.id) };
  }

  @Patch(":noteId")
  @RequirePermission("lists:write")
  public update(@Param("noteId") noteId: string, @Body(new ZodValidationPipe(updateNoteSchema)) input: UpdateNoteInput): NoteResponse {
    this.requireNote(noteId);
    return { note: this.notes.update(noteId, input) };
  }

  @Delete(":noteId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("lists:write")
  public delete(@Param("noteId") noteId: string): void {
    this.requireNote(noteId);
    this.notes.delete(noteId);
  }

  private requireNote(noteId: string): void {
    if (!this.notes.findById(noteId)) {
      throw AppException.notFound("Nota non trovata.");
    }
  }
}
