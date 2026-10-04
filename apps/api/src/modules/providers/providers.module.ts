import { Module } from "@nestjs/common";
import { CalDavClient } from "./caldav/caldav-client";
import { CookidooClient } from "./cookidoo/cookidoo-client";
import { ProviderAccountsRepository } from "./provider-accounts.repository";
import { ProvidersController } from "./providers.controller";
import { ProvidersService } from "./providers.service";

@Module({
  controllers: [ProvidersController],
  providers: [ProviderAccountsRepository, ProvidersService, { provide: CalDavClient, useFactory: () => new CalDavClient() },
    { provide: CookidooClient, useFactory: () => new CookidooClient() }
  ],
  exports: [ProviderAccountsRepository, ProvidersService, CalDavClient, CookidooClient]
})
export class ProvidersModule {}
