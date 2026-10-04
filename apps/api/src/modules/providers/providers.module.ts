import { Module } from "@nestjs/common";
import { CalDavClient } from "./caldav/caldav-client";
import { CookidooClient } from "./cookidoo/cookidoo-client";
import { GoogleAuthController } from "./google-auth.controller";
import { GoogleClient } from "./google/google-client";
import { ProviderAccountsRepository } from "./provider-accounts.repository";
import { ProvidersController } from "./providers.controller";
import { ProvidersService } from "./providers.service";

@Module({
  controllers: [ProvidersController, GoogleAuthController],
  providers: [
    ProviderAccountsRepository,
    ProvidersService,
    { provide: CalDavClient, useFactory: () => new CalDavClient() },
    { provide: CookidooClient, useFactory: () => new CookidooClient() },
    { provide: GoogleClient, useFactory: () => new GoogleClient() }
  ],
  exports: [ProviderAccountsRepository, ProvidersService, CalDavClient, CookidooClient, GoogleClient]
})
export class ProvidersModule {}
