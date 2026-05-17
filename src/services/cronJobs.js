import cron from 'node-cron';
import prisma from '../config/db.js';

export const initCronJobs = () => {
  cron.schedule('*/10 * * * *', async () => {
    const fifteenMinutesAgo = new Date(Date.now() + 3 * 60 * 60 * 1000 - 15 * 60 * 1000);
    await prisma.booking.updateMany({
      where: {
        status_id: 2,
        is_paid: false,
        created_at: { lt: fifteenMinutesAgo },
      },
      data: {
        status_id: 5,
      },
    });
    console.log('[CRON] Проверка просроченных броней завершена');
  });

  // // Задача запускается каждую минуту
  // cron.schedule('* * * * *', async () => {
  //   console.log('--- Запуск сканера оплат ---');

  //   try {
  //     // 1. Находим все бронирования, которые "Ожидают оплаты" (status_id: 2)
  //     // И у которых есть payment_id (значит оплата была инициирована)
  //     const pendingBookings = await prisma.booking.findMany({
  //       where: {
  //         status_id: 2,
  //         is_paid: false,
  //         payment_id: { not: null },
  //       },
  //     });

  //     for (const booking of pendingBookings) {
  //       // 2. Запрашиваем статус у ЮKassa по payment_id
  //       const paymentInfo = await checkout.getPayment(booking.payment_id);

  //       console.log(`Проверка брони №${booking.booking_id}: статус ${paymentInfo.status}`);

  //       // 3. Если оплата прошла успешно
  //       if (paymentInfo.status === 'succeeded') {
  //         await prisma.booking.update({
  //           where: { booking_id: booking.booking_id },
  //           data: {
  //             is_paid: true,
  //             status_id: 1, // Меняем на "Оплачено"
  //           },
  //         });
  //         console.log(`Бронь №${booking.booking_id} успешно обновлена: ОПЛАЧЕНО`);
  //       }

  //       // 4. Опционально: если платеж отменен (canceled), можно отменить и бронь
  //       else if (paymentInfo.status === 'canceled') {
  //         await prisma.booking.update({
  //           where: { booking_id: booking.booking_id },
  //           data: { status_id: 3 }, // "Отменено"
  //         });
  //       }
  //     }
  //   } catch (error) {
  //     console.error('Ошибка в работе крона:', error);
  //   }
  // });
};
