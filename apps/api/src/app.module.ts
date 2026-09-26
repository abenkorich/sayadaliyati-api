import { AiController } from './admin/ai.controller.js';
import { AiService } from './admin/ai.service.js';
import { GeoController } from './geography/geo.controller.js';
import { GeoService } from './geography/geo.service.js';
import { AdminTransferController } from './admin/transfer.controller.js';
import { AdminTransferService } from './admin/transfer.service.js';
import { DirectoryController } from './directory/directory.controller.js';
import { DirectoryService } from './directory/directory.service.js';
import { AdminController } from './admin/admin.controller.js';
import { AdminService } from './admin/admin.service.js';
import { ScanPreferencesController } from './prescriptions/scan-preferences.controller.js';
import { PrescriptionScanController } from './prescriptions/scan.controller.js';
import { PrescriptionScanService } from './prescriptions/scan.service.js';
import { NotificationInboxController } from './notifications/inbox.controller.js';
import { NotificationInbox } from './notifications/inbox.service.js';
import {
  TreatmentsController,
  MedicationEventsController,
} from './treatments/treatments.controller.js';
import { TreatmentsService } from './treatments/treatments.service.js';
import { NotificationPreferencesController } from './notifications/preferences.controller.js';
import { NotificationPreferencesService } from './notifications/preferences.service.js';
import {
  DocumentsController,
  DocumentUploadCapacity,
} from './documents/documents.controller.js';
import { DocumentsService } from './documents/documents.service.js';
import { DocumentStorage } from './documents/storage.service.js';
import { PrescriptionsController } from './prescriptions/prescriptions.controller.js';
import { PrescriptionsService } from './prescriptions/prescriptions.service.js';
import { InventoryController } from './inventory/inventory.controller.js';
import { InventoryService } from './inventory/inventory.service.js';
import { CatalogController } from './catalog/catalog.controller.js';
import { CatalogService } from './catalog/catalog.service.js';
import { CatalogRepository } from './catalog/catalog.repository.js';
import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { API_CONFIG } from './config.js';
import type { ApiConfig } from './config.js';
import { DatabaseService } from './database.service.js';
import { HealthController } from './health.controller.js';
import { APP_GUARD } from '@nestjs/core';
import { AuthController, ProfileController } from './auth/auth.controller.js';
import { AuthService } from './auth/auth.service.js';
import { AuthGuard } from './auth/auth.guard.js';
import { TokensService } from './auth/tokens.service.js';
import { PasswordsService } from './auth/passwords.service.js';
import { RateLimitService } from './auth/rate-limit.service.js';

@Module({})
export class AppModule {
  static register(config: ApiConfig): DynamicModule {
    return {
      module: AppModule,
      controllers: [
        AiController,
        GeoController,
        AdminTransferController,
        DirectoryController,
        AdminController,
        PrescriptionScanController,
        ScanPreferencesController,
        DocumentsController,
        NotificationPreferencesController,
        TreatmentsController,
        MedicationEventsController,
        NotificationInboxController,
        HealthController,
        AuthController,
        ProfileController,
        CatalogController,
        InventoryController,
        PrescriptionsController,
      ],
      providers: [
        AiService,
        GeoService,
        AdminTransferService,
        DirectoryService,
        AdminService,
        PrescriptionScanService,
        { provide: API_CONFIG, useValue: config },
        DocumentStorage,
        DocumentsService,
        DocumentUploadCapacity,
        NotificationPreferencesService,
        TreatmentsService,
        NotificationInbox,
        DatabaseService,
        CatalogService,
        InventoryService,
        PrescriptionsService,
        CatalogRepository,
        AuthService,
        TokensService,
        PasswordsService,
        RateLimitService,
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    };
  }
}
