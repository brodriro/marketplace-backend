import {
  BadRequestException,
  Controller,
  HttpCode,
  Inject,
  Logger,
  NotFoundException,
  Post,
  Req,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { OrdersService } from '../orders/orders.service';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from '../payments/payment-provider';

/**
 * `POST /webhooks/stripe` (§6.5). Sin prefijo `/v1` (`VERSION_NEUTRAL`) para que la URL del
 * dashboard del proveedor sea estable. No hay guard de auth: la firma verificada por el proveedor
 * (`PaymentProvider.verifyWebhook` sobre `req.rawBody`) es la autenticación. Si el proveedor activo
 * no maneja webhooks (p. ej. `bypass`) → `404`.
 */
@Controller({ path: 'webhooks/stripe', version: VERSION_NEUTRAL })
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
    private readonly orders: OrdersService,
  ) {}

  @Post()
  @HttpCode(200)
  async handleStripe(
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ received: boolean }> {
    if (!this.payments.supportsWebhook) {
      throw new NotFoundException(
        `El proveedor de pago "${this.payments.name}" no expone webhooks`,
      );
    }

    const signature = req.headers['stripe-signature'];
    if (!req.rawBody || typeof signature !== 'string') {
      throw new BadRequestException('Falta cuerpo o firma del webhook');
    }

    let result: ReturnType<PaymentProvider['verifyWebhook']>;
    try {
      result = this.payments.verifyWebhook(req.rawBody, signature);
    } catch (err) {
      this.logger.warn(
        `Firma de webhook inválida: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw new BadRequestException('Firma de webhook inválida');
    }

    if (result.type === 'payment_succeeded' && result.orderId) {
      const { changed } = await this.orders.markPaidBySystem(result.orderId);
      this.logger.log(
        `payment_succeeded → pedido ${result.orderId} ${
          changed ? 'marcado paid' : '(ya no estaba pending_payment)'
        }`,
      );
    }

    return { received: true };
  }
}
