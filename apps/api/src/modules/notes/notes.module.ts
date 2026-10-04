import { Module } from "@nestjs/common";
import { NotesController } from "./notes.controller";
import { NotesRepository } from "./notes.repository";

@Module({
  controllers: [NotesController],
  providers: [NotesRepository]
})
export class NotesModule {}
