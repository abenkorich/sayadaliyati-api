import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiBody } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';
import { actor, type AuthRequest } from '../auth/auth.guard.js';
import { ApiError } from '../auth/errors.js';
import { AdminService } from './admin.service.js';
import {
  listSchema,
  idSchema,
  directoryKindSchema,
  userPatchSchema,
  medicineSchema,
  directorySchema,
  settingsSchema,
} from './admin.schemas.js';
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError('VALIDATION_ERROR');
  return result.data;
}
const bodySchema = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;
@ApiTags('Administration')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}
  @Get('overview') overview(@Req() r: AuthRequest) {
    return this.admin.overview(actor(r));
  }
  @Get('users') users(@Req() r: AuthRequest, @Query() q: unknown) {
    return this.admin.users(actor(r), parse(listSchema, q));
  }
  @Patch('users/:id') @ApiBody({ schema: bodySchema(userPatchSchema) }) user(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.admin.userStatus(
      actor(r),
      parse(idSchema, id),
      parse(userPatchSchema, b),
      r.requestId,
    );
  }
  @Get('medicines') medicines(@Req() r: AuthRequest, @Query() q: unknown) {
    return this.admin.medicines(actor(r), parse(listSchema, q));
  }
  @Post('medicines')
  @ApiBody({ schema: bodySchema(medicineSchema) })
  createMedicine(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.admin.saveMedicine(
      actor(r),
      undefined,
      parse(medicineSchema, b),
      r.requestId,
    );
  }
  @Patch('medicines/:id')
  @ApiBody({ schema: bodySchema(medicineSchema) })
  medicine(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) {
    return this.admin.saveMedicine(
      actor(r),
      parse(idSchema, id),
      parse(medicineSchema, b),
      r.requestId,
    );
  }
  @Get('directory/:kind') directory(
    @Req() r: AuthRequest,
    @Param('kind') kind: string,
    @Query() q: unknown,
  ) {
    return this.admin.directory(
      actor(r),
      parse(directoryKindSchema, kind),
      parse(listSchema, q),
    );
  }
  @Post('directory/:kind')
  @ApiBody({ schema: bodySchema(directorySchema) })
  createDirectory(
    @Req() r: AuthRequest,
    @Param('kind') kind: string,
    @Body() b: unknown,
  ) {
    return this.admin.saveDirectory(
      actor(r),
      parse(directoryKindSchema, kind),
      undefined,
      parse(directorySchema, b),
      r.requestId,
    );
  }
  @Patch('directory/:kind/:id')
  @ApiBody({ schema: bodySchema(directorySchema) })
  updateDirectory(
    @Req() r: AuthRequest,
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.admin.saveDirectory(
      actor(r),
      parse(directoryKindSchema, kind),
      parse(idSchema, id),
      parse(directorySchema, b),
      r.requestId,
    );
  }
  @Get('settings') settings(@Req() r: AuthRequest) {
    return this.admin.settings(actor(r));
  }
  @Patch('settings')
  @ApiBody({ schema: bodySchema(settingsSchema) })
  saveSettings(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.admin.saveSettings(
      actor(r),
      parse(settingsSchema, b),
      r.requestId,
    );
  }
}
