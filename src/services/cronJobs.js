import cron from 'node-cron';
import prisma from '../config/db.js';
import { awardBaseXp, checkActivities } from './loyaltyService.js';

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

  //проверка броней на которые не пришел клиент
  cron.schedule('* * * * *', async () => {
    const nowMoscow = new Date(Date.now() + 15 * 60 * 60 * 1000);

    const notStartBookings = await prisma.booking.findMany({
      where: {
        status_id: { in: [1, 2, 6] }, // Выполняется
        time_begin: {
          lte: new Date(nowMoscow.getTime() - 15 * 60 * 1000),
        },
      },
      include: {
        room: { include: { branch_office: true } },
      },
    });

    if (notStartBookings.length === 0) return;

    for (const booking of notStartBookings) {
      await prisma.$transaction(async (tx) => {
        // 1. Завершаем бронь
        await tx.booking.update({
          where: { booking_id: booking.booking_id },
          data: { status_id: 8 },
        });
      });

      console.log(`[CRON] У брони #${booking.booking_id} установлен статус неявки клиента`);
    }

    console.log('[CRON] Проверка неначатых броней завершена');
  });

  // Каждую минуту проверяем бронирования со статусом "Выполняется"
  cron.schedule('* * * * *', async () => {
    try {
      const nowMoscow = new Date(Date.now() + 15 * 60 * 60 * 1000);

      const overdueBookings = await prisma.booking.findMany({
        where: {
          status_id: 7, // Выполняется
          time_end: {
            lte: new Date(nowMoscow.getTime() - 15 * 60 * 1000),
          },
        },
        include: {
          room: { include: { branch_office: true } },
        },
      });

      if (overdueBookings.length === 0) return;

      for (const booking of overdueBookings) {
        await prisma.$transaction(async (tx) => {
          // 1. Завершаем бронь
          await tx.booking.update({
            where: { booking_id: booking.booking_id },
            data: { status_id: 4 },
          });

          // 2. Базовое начисление XP за бронь (для всех способов оплаты)
          await awardBaseXp(tx, booking.user_id, booking.booking_id);

          // 3. Проверка доп. активностей (ранняя пташка, безлимит и т.д.)
          await checkActivities(tx, booking.user_id, {
            ...booking,
            branch_id: booking.room.branch_id,
          });
        });

        console.log(`[CRON] Бронь #${booking.booking_id} завершена, XP начислен`);
      }
    } catch (err) {
      console.error('[CRON] Ошибка автозавершения:', err);
    }
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
