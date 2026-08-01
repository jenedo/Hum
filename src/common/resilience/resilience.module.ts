import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CircuitBreakerRegistry } from './circuit-breaker-registry';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [CircuitBreakerRegistry],
  exports: [CircuitBreakerRegistry],
})
export class ResilienceModule {}
