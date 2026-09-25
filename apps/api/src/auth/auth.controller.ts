import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';
import {
  loginSchema,
  logoutSchema,
  profilePatchSchema,
  refreshSchema,
  registrationSchema,
} from '@saydaliyati/validation';
import { actor, AllowRevokedSession, Public, requestIp } from './auth.guard.js';
import type { AuthRequest } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { ApiError } from './errors.js';
import { RateLimitService } from './rate-limit.service.js';
import { TokensService } from './tokens.service.js';
import {
  emptyResponse,
  errorResponse,
  loginResponse,
  profileResponse,
  tokenResponse,
} from './openapi.js';

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ApiError('VALIDATION_ERROR');
  return result.data;
}
// Zod's return type also covers newer JSON Schema dialects. The explicit target
// restricts emitted definitions to the OpenAPI 3.0 schema dialect used by Nest.
const bodySchema = (schema: z.ZodType) =>
  z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io: 'input',
    unrepresentable: 'any',
  }) as SchemaObject;

@ApiTags('Authentication')
@ApiResponse({
  status: 400,
  schema: errorResponse,
  description: 'Validation failed',
})
@ApiResponse({
  status: 401,
  schema: errorResponse,
  description: 'Invalid, expired or revoked credentials',
})
@ApiResponse({
  status: 403,
  schema: errorResponse,
  description: 'Account not permitted',
})
@ApiResponse({
  status: 429,
  schema: errorResponse,
  description: 'Attempt budget exhausted',
})
@ApiResponse({
  status: 503,
  schema: errorResponse,
  description: 'Required service unavailable',
})
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(RateLimitService) private readonly rates: RateLimitService,
    @Inject(TokensService) private readonly tokens: TokensService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Create a patient account and independent session' })
  @ApiBody({
    schema: {
      ...bodySchema(registrationSchema),
      anyOf: [{ required: ['email'] }, { required: ['phone'] }],
      properties: {
        ...bodySchema(registrationSchema).properties,
        password: {
          type: 'string',
          format: 'password',
          minLength: 15,
          maxLength: 128,
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    schema: loginResponse,
    description: 'Patient identity and token pair',
  })
  async register(@Body() body: unknown, @Req() request: AuthRequest) {
    await this.rates.check('register-ip', requestIp(request), 5, 3600000);
    return this.auth.register(
      parse(registrationSchema, body),
      request.requestId,
    );
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Authenticate email or international phone and create a session',
  })
  @ApiBody({ schema: bodySchema(loginSchema) })
  @ApiResponse({ status: 200, schema: loginResponse })
  async login(@Body() body: unknown, @Req() request: AuthRequest) {
    await this.rates.check('login-ip', requestIp(request), 30, 60000);
    const input = parse(loginSchema, body);
    await this.rates.check('login-identifier', input.identifier, 10, 900000);
    return this.auth.login(input, request.requestId);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Atomically rotate a refresh token; authentic reuse revokes the session',
  })
  @ApiBody({ schema: bodySchema(refreshSchema) })
  @ApiResponse({ status: 200, schema: tokenResponse })
  async refresh(@Body() body: unknown, @Req() request: AuthRequest) {
    await this.rates.check('refresh-ip', requestIp(request), 60, 60000);
    const input = parse(refreshSchema, body);
    const sessionId = this.tokens.verifyRefresh(input.refreshToken);
    await this.rates.check('refresh-session', sessionId, 10, 60000);
    return this.auth.refresh(input.refreshToken, request.requestId);
  }

  @AllowRevokedSession()
  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Revoke only the current session; idempotent while the access token is unexpired',
  })
  @ApiResponse({ status: 200, schema: emptyResponse })
  async logout(@Body() body: unknown, @Req() request: AuthRequest) {
    parse(logoutSchema, body ?? {});
    return this.auth.logout(actor(request), request.requestId);
  }
}

@ApiTags('Patient profile')
@ApiResponse({ status: 200, schema: profileResponse })
@ApiResponse({ status: 400, schema: errorResponse })
@ApiResponse({ status: 401, schema: errorResponse })
@ApiResponse({ status: 403, schema: errorResponse })
@ApiResponse({ status: 429, schema: errorResponse })
@ApiResponse({ status: 503, schema: errorResponse })
@ApiBearerAuth()
@Controller('me/profile')
export class ProfileController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get()
  @ApiOperation({ summary: 'Read only the authenticated patient profile' })
  profile(@Req() request: AuthRequest) {
    return this.auth.profile(actor(request));
  }

  @Patch()
  @ApiBody({ schema: bodySchema(profilePatchSchema) })
  @ApiOperation({
    summary:
      'Update names, language or timezone of the authenticated patient only',
  })
  update(@Body() body: unknown, @Req() request: AuthRequest) {
    return this.auth.updateProfile(
      actor(request),
      parse(profilePatchSchema, body),
      request.requestId,
    );
  }
}
