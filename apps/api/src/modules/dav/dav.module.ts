import { Module } from "@nestjs/common";
import { MembersModule } from "../members/members.module";
import { DavBootstrap } from "./dav-bootstrap";
import { DavGatewayService } from "./dav-gateway.service";
import { DavTasksClient } from "./dav-tasks.client";
import { DavController } from "./dav.controller";

@Module({
  imports: [MembersModule],
  controllers: [DavController],
  providers: [
    DavGatewayService,
    DavBootstrap,
    { provide: DavTasksClient, inject: [DavGatewayService], useFactory: (gateway: DavGatewayService) => new DavTasksClient(gateway.radicaleUrl) }
  ],
  exports: [DavGatewayService, DavTasksClient]
})
export class DavModule {}
