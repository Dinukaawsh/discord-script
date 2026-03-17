import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredApiKey = this.config.get<string>('API_KEY')?.trim();
    if (!requiredApiKey) {
      throw new ServiceUnavailableException(
        'API key protection is enabled, but API_KEY is not configured.',
      );
    }

    const request = context.switchToHttp().getRequest();
    const providedApiKey = String(request.headers['x-api-key'] || '').trim();

    if (!providedApiKey || providedApiKey !== requiredApiKey) {
      throw new UnauthorizedException('Invalid or missing x-api-key');
    }

    return true;
  }
}
