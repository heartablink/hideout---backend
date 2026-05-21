import cron from 'node-cron';
import prisma from '../config/db.js';
import { awardBaseXp, checkActivities } from './loyaltyService.js';

// Текущее время по Москве (UTC+3)
const nowMoscow = () => new Date(Date.now() + 3 * 60 * 60 * 1000);

export const initCronJobs = () => {
  // ─────────────────────────────────────────────
  // 1. Отмена неоплаченных броней (онлайн-оплата)
  //    Если через 15 минут после создания оплата
  //    так и не пришла — отменяем бронь
  //    Запуск: каждые 10 минут
  // ─────────────────────────────────────────────
  cron.schedule('*/10 * * * *', async () => {
    try {
      const fifteenMinutesAgo = new Date(nowMoscow().getTime() - 15 * 60 * 1000);

      const cancelled = await prisma.booking.updateMany({
        where: {
          status_id: 2, // Ожидает оплаты (онлайн)
          is_paid: false,
          created_at: { lt: fifteenMinutesAgo },
        },
        data: { status_id: 5 }, // Отменено (просрочено)
      });

      if (cancelled.count > 0) {
        console.log(`[CRON] Отменено просроченных неоплаченных броней: ${cancelled.count}`);
      }
    } catch (err) {
      console.error('[CRON] Ошибка отмены неоплаченных броней:', err);
    }
  });

  // ─────────────────────────────────────────────
  // 2. Автоматическая неявка клиента
  //    Если через 15 минут после запланированного
  //    начала бронь так и не запущена — неявка
  //    Запуск: каждую минуту
  // ─────────────────────────────────────────────
  cron.schedule('* * * * *', async () => {
    try {
      const now = nowMoscow();
      const todayStr = now.toISOString().slice(0, 10);
      const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);

      // Ищем только сегодняшние брони у которых время начала
      // уже прошло более 15 минут назад, но они ещё не запущены
      const notStarted = await prisma.booking.findMany({
        where: {
          status_id: { in: [1, 6] }, // Оплачено / Ожидает оплаты наличными
          booking_date: new Date(`${todayStr}T00:00:00.000Z`),
          time_begin: {
            // time_begin хранится как DateTime(Time) — сравниваем только время
            lte: new Date(
              `1970-01-01T${String(fifteenMinutesAgo.getUTCHours()).padStart(2, '0')}:${String(
                fifteenMinutesAgo.getUTCMinutes(),
              ).padStart(2, '0')}:00.000Z`,
            ),
          },
        },
      });

      if (notStarted.length === 0) return;

      for (const booking of notStarted) {
        await prisma.$transaction(async (tx) => {
          await tx.booking.update({
            where: { booking_id: booking.booking_id },
            data: { status_id: 8 }, // Неявка
          });
        });

        console.log(`[CRON] Неявка: бронь #${booking.booking_id} (время начала прошло > 15 мин)`);
      }
    } catch (err) {
      console.error('[CRON] Ошибка проверки неявок:', err);
    }
  });

  // ─────────────────────────────────────────────
  // 3. Автозавершение просроченных активных броней
  //    Если бронь "Выполняется" и время окончания
  //    прошло более 15 минут назад — завершаем
  //    и начисляем XP
  //    Запуск: каждую минуту
  // ─────────────────────────────────────────────
  cron.schedule('* * * * *', async () => {
    try {
      const now = nowMoscow();
      const todayStr = now.toISOString().slice(0, 10);
      const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);

      const overdueBookings = await prisma.booking.findMany({
        where: {
          status_id: 7, // Выполняется
          booking_date: new Date(`${todayStr}T00:00:00.000Z`),
          time_end: {
            lte: new Date(
              `1970-01-01T${String(fifteenMinutesAgo.getUTCHours()).padStart(2, '0')}:${String(
                fifteenMinutesAgo.getUTCMinutes(),
              ).padStart(2, '0')}:00.000Z`,
            ),
          },
        },
        include: {
          room: { include: { branch_office: true } },
        },
      });

      if (overdueBookings.length === 0) return;

      for (const booking of overdueBookings) {
        await prisma.$transaction(async (tx) => {
          await tx.booking.update({
            where: { booking_id: booking.booking_id },
            data: { status_id: 3 }, // Завершено
          });

          await awardBaseXp(tx, booking.user_id, booking.booking_id);

          await checkActivities(tx, booking.user_id, {
            ...booking,
            branch_id: booking.room.branch_id,
          });
        });

        console.log(`[CRON] Автозавершение: бронь #${booking.booking_id}, XP начислен`);
      }
    } catch (err) {
      console.error('[CRON] Ошибка автозавершения:', err);
    }
  });

  // ─────────────────────────────────────────────
  // 4. Автозакрытие смен в 23:45
  //    Запуск: каждый день в 23:45
  // ─────────────────────────────────────────────
  cron.schedule('45 23 * * *', async () => {
    try {
      const now = new Date(Date.now() + 3 * 60 * 60 * 1000); // MSK

      const openShifts = await prisma.work_shift.findMany({
        where: { closed_at: null },
      });

      if (openShifts.length === 0) return;

      for (const shift of openShifts) {
        await prisma.work_shift.update({
          where: { shift_id: shift.shift_id },
          data: { closed_at: now },
        });
        console.log(`[CRON] Автозакрытие смены #${shift.shift_id} сотрудника #${shift.staff_id}`);
      }

      console.log(`[CRON] Автозакрыто смен: ${openShifts.length}`);
    } catch (err) {
      console.error('[CRON] Ошибка автозакрытия смен:', err);
    }
  });
};
