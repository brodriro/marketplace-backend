import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrdersService } from './orders.service';

/**
 * Cron del barrido de pedidos `pending_payment` vencidos (§6.5). Corre cada minuto; la ventana la
 * decide `ORDER_PAYMENT_TTL_MIN`. Es best-effort: un fallo se loguea, no tumba el proceso.
 */
@Injectable()
export class OrderPaymentSweepService {
  private readonly logger = new Logger(OrderPaymentSweepService.name);

  constructor(private readonly orders: OrdersService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<void> {
    try {
      const closed = await this.orders.expirePendingPayments();
      if (closed > 0) {
        this.logger.log(
          `Barrido: ${closed} pedido(s) pending_payment vencido(s) → cancelled`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Barrido de pending_payment falló: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
