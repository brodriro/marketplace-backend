import {
  BadRequestException,
  Controller,
  HttpCode,
  Logger,
  Post,
  Req,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import type Stripe from 'stripe';
import { OrdersService } from '../orders/orders.service';
import { StripeService } from '../payments/stripe.service';

/**
 * `POST /webhooks/stripe` (§6.5). Sin prefijo `/v1` (`VERSION_NEUTRAL`) para que la URL del
 * dashboard de Stripe sea estable. No hay guard de auth: la firma `Stripe-Signature` verificada
 * contra `STRIPE_WEBHOOK_SECRET` es la autenticación. Usa `req.rawBody` (bytes exactos).
 */
@Controller({ path: 'webhooks/stripe', version: VERSION_NEUTRAL })
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly stripe: StripeService,
    private readonly orders: OrdersService,
  ) {}

  @Post()
  @HttpCode(200)
  async handleStripe(
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ received: boolean }> {
    const signature = req.headers['stripe-signature'];
    if (!req.rawBody || typeof signature !== 'string') {
      throw new BadRequestException('Falta cuerpo o firma del webhook');
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.constructEvent(req.rawBody, signature);
    } catch (err) {
      this.logger.warn(
        `Firma de webhook inválida: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw new BadRequestException('Firma de webhook inválida');
    }

    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object;
      const orderId = intent.metadata?.orderId;
      if (orderId) {
        const { changed } = await this.orders.markPaidBySystem(orderId);
        this.logger.log(
          `payment_intent.succeeded ${intent.id} → pedido ${orderId} ${
            changed ? 'marcado paid' : '(ya no estaba pending_payment)'
          }`,
        );
      } else {
        this.logger.warn(
          `payment_intent.succeeded ${intent.id} sin metadata.orderId`,
        );
      }
    }

    return { received: true };
  }
}
