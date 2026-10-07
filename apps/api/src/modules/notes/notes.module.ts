import { Module } from "@nestjs/common";
import { DavModule } from "../dav/dav.module";
import { NotesController } from "./notes.controller";

@Module({
  imports: [DavModule],
  controllers: [NotesController]
})
export class NotesModule {}
