import { error } from 'node:console';
import prisma from '../config/db.js';
import { now } from 'sequelize/lib/utils';
import { awardBaseXp, checkActivities } from '../services/loyaltyService.js';

///---------------------------
//юкасса
import { YooCheckout } from '@a2seven/yoo-checkout';
import { v4 as uuidv4 } from 'uuid'; //генерация универсальных уникальных идентификаторов (как ключ идемпотентности)

const checkout = new YooCheckout({
  shopId: '1338646',
  secretKey: 'test_sAwfJLiJ7LO5ww9p7d8-EJQqivgKrLJVHuA36_SRDRU',
});
//----------------------------

const createBookingDeposit = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Пользователь не авторизован' });
    }

    const { userId } = req.user;
    const { roomId, date, slots } = req.body;

    const user = await prisma.permission.findFirst({ where: { user_id: userId } });

    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }
    if (user.role_id !== 3) {
      return res.status(403).json({ message: 'Только клиенты могут бронировать' });
    }

    const sortedSlots = slots.sort();
    const timeBegin = new Date(`${date}T${sortedSlots[0]}:00Z`);
    const timeEnd = new Date(`${date}T${sortedSlots[sortedSlots.length - 1]}:00Z`);
    timeEnd.setUTCHours(timeEnd.getUTCHours() + 1);

    const result = await prisma.$transaction(async (tx) => {
      // Проверка на двойное бронирование
      const existing = await tx.booking.findFirst({
        where: {
          room_id: Number(roomId),
          booking_date: new Date(date),
          status_booking: { name: { in: ['Оплачено', 'Ожидает оплаты'] } },
          OR: [{ time_begin: { lt: timeEnd, gte: timeBegin } }],
        },
      });

      if (existing) throw new Error('Один из выбранных слотов уже занят');

      // Данные комнаты и уровень лояльности
      const room = await tx.room.findFirst({
        where: { room_id: Number(roomId) },
      });

      const userLoyalty = await tx.loyalty.findUnique({
        where: { user_id: userId },
        include: { loyalty_level: true },
      });

      // Актуальный баланс из последней транзакции
      const lastTx = await tx.deposit_transaction.findFirst({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        select: { current_balance: true },
      });

      const currentBalance = lastTx ? Number(lastTx.current_balance) : 0;

      // Расчёт стоимости со скидкой
      const basePrice = Number(room.price) * slots.length;
      const discountPercent = Number(userLoyalty.loyalty_level.discount) || 0;
      const totalPrice = basePrice * (1 - discountPercent);

      // Проверка баланса
      if (currentBalance < totalPrice) {
        throw new Error(
          `Недостаточно средств. Нужно ${totalPrice} ₽, на счету ${currentBalance} ₽`,
        );
      }

      // Создание бронирования
      const booking = await tx.booking.create({
        data: {
          user_id: userId,
          room_id: Number(roomId),
          booking_date: new Date(date),
          time_begin: timeBegin,
          time_end: timeEnd,
          total_cost: basePrice,
          paid_sum: totalPrice,
          is_paid: true,
          status_id: 1,
          discount_applied: discountPercent,
          created_at: new Date(Date.now() + 3 * 60 * 60 * 1000),
        },
      });

      const newBalance = currentBalance - totalPrice;

      // Транзакция списания
      await tx.deposit_transaction.create({
        data: {
          user_id: userId,
          amount: -totalPrice,
          current_balance: newBalance,
          booking_id: booking.booking_id,
          operation_type_id: 2,
          admin_id: userId,
          created_at: new Date(Date.now() + 3 * 60 * 60 * 1000),
          comment: 'Оплата бронирования с игрового счёта',
        },
      });

      return {
        booking,
        discountApplied: `${discountPercent * 100}%`,
        saved: basePrice - totalPrice,
        newBalance,
      };
    });

    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};
const createBookingExternal = async (req, res) => {
  try {
    // 1. Проверяем, что middleware сработал
    if (!req.user) {
      return res.status(401).json({ message: 'Пользователь не авторизован' });
    }

    const { userId } = req.user; // Из middleware
    const { roomId, date, slots } = req.body;

    const user = await prisma.permission.findFirst({ where: { user_id: userId } });

    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }
    if (user.role_id !== 3) {
      return res.status(403).json({ message: 'Только клиенты могут бронировать' });
    }

    // Подготовка времени
    //используем Z для корректности UTC
    const sortedSlots = slots.sort();
    const timeBegin = new Date(`${date}T${sortedSlots[0]}:00Z`);
    const timeEnd = new Date(`${date}T${sortedSlots[sortedSlots.length - 1]}:00Z`);
    timeEnd.setUTCHours(timeEnd.getUTCHours() + 1);

    //Запускаем транзакцию для проверки доступности и создания "черновика" брони
    const result = await prisma.$transaction(async (tx) => {
      // Проверка на двойное бронирование
      const existing = await tx.booking.findFirst({
        where: {
          room_id: Number(roomId),
          booking_date: new Date(date),
          status_booking: { name: { in: ['Оплачено', 'Ожидает оплаты'] } },
          OR: [{ time_begin: { lt: timeEnd, gte: timeBegin } }],
        },
      });

      if (existing) throw new Error('Один из выбранных слотов уже занят');

      const room = await tx.room.findFirst({
        where: { room_id: Number(roomId) },
        include: { branch_office: true },
      });

      // РАСЧЕТ СТОИМОСТИ
      const totalPrice = Number(room.price) * slots.length;

      // Создаем бронирование со статусом "Ожидает оплаты" (status_id: 2 или какой у тебя по базе)
      // ВАЖНО: is_paid: false
      const booking = await tx.booking.create({
        data: {
          user_id: userId,
          room_id: Number(roomId),
          booking_date: new Date(date),
          time_begin: timeBegin,
          time_end: timeEnd,
          total_cost: totalPrice,
          paid_sum: 0,
          is_paid: false,
          status_id: 2, // Предположим, 2 - это "Ожидает оплаты"
          created_at: new Date(new Date().getTime() + 3 * 60 * 60 * 1000),
        },
      });

      //---------------------------
      // Создаем платеж в ЮKassa
      const idempotenceKey = uuidv4();
      const payment = await checkout.createPayment(
        {
          amount: {
            value: totalPrice.toFixed(2),
            currency: 'RUB',
          },
          confirmation: {
            type: 'redirect',
            // ВАЖНО: прокидываем ID брони в URL возврата
            // return_url: `http://localhost:3000/booking/success?bookingId=${booking.booking_id}`,
            return_url: `http://localhost:3000/profile`,
          },
          description: `Оплата бронирования №${booking.booking_id} (Комната: ${roomId})`,
          metadata: {
            bookingId: booking.booking_id,
            userId: userId,
          },
          capture: true,
        },
        idempotenceKey,
      );
      //---------------------------

      return {
        confirmationUrl: payment.confirmation.confirmation_url,
        bookingId: booking.booking_id,
      };
    });

    res.status(201).json(result);
  } catch (err) {
    console.error('Ошибка внешней оплаты:', err);
    res.status(400).json({ message: err.message });
  }
};

const createBookingCash = async (req, res) => {
  try {
    // 1. Проверяем, что middleware сработал
    if (!req.user) {
      return res.status(401).json({ message: 'Пользователь не авторизован' });
    }

    const { userId } = req.user; // Из middleware
    const { roomId, date, slots } = req.body;

    const user = await prisma.permission.findFirst({ where: { user_id: userId } });

    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }
    if (user.role_id !== 3) {
      return res.status(403).json({ message: 'Только клиенты могут бронировать' });
    }

    // Подготовка времени
    //используем Z для корректности UTC
    const sortedSlots = slots.sort();
    const timeBegin = new Date(`${date}T${sortedSlots[0]}:00Z`);
    const timeEnd = new Date(`${date}T${sortedSlots[sortedSlots.length - 1]}:00Z`);
    timeEnd.setUTCHours(timeEnd.getUTCHours() + 1);

    //Запускаем транзакцию для проверки доступности и создания "черновика" брони
    const result = await prisma.$transaction(async (tx) => {
      // Проверка на двойное бронирование
      const existing = await tx.booking.findFirst({
        where: {
          room_id: Number(roomId),
          booking_date: new Date(date),
          status_booking: { name: { in: ['Оплачено', 'Ожидает оплаты'] } },
          OR: [{ time_begin: { lt: timeEnd, gte: timeBegin } }],
        },
      });

      if (existing) throw new Error('Один из выбранных слотов уже занят');

      const room = await tx.room.findFirst({
        where: { room_id: Number(roomId) },
        include: { branch_office: true },
      });

      // РАСЧЕТ СТОИМОСТИ
      const totalPrice = Number(room.price) * slots.length;

      // Создаем бронирование со статусом "Ожидает оплаты" (status_id: 2 или какой у тебя по базе)
      // ВАЖНО: is_paid: false
      const booking = await tx.booking.create({
        data: {
          user_id: userId,
          room_id: Number(roomId),
          booking_date: new Date(date),
          time_begin: timeBegin,
          time_end: timeEnd,
          total_cost: totalPrice,
          paid_sum: 0,
          is_paid: false,
          status_id: 6, //  6 - это "Ожидает оплаты (наличными)
          created_at: new Date(new Date().getTime() + 3 * 60 * 60 * 1000),
        },
      });

      return {
        bookingId: booking.booking_id,
      };
    });

    res.status(201).json(result);
  } catch (err) {
    console.error('Ошибка создания броинрвоания:', err);
    res.status(400).json({ message: err.message });
  }
};

export const handleYookassaWebhook = async (req, res) => {
  const { event, object } = req.body;

  if (event === 'payment.succeeded') {
    const paymentId = object.id;
    const metadata = object.metadata; // Те самые данные, что мы передавали

    // Находим бронь и обновляем её
    await prisma.booking.updateMany({
      where: {
        user_id: Number(metadata.userId),
        room_id: Number(metadata.roomId),
        booking_date: new Date(metadata.date),
        status_id: 2, // Ожидает оплаты
      },
      data: {
        is_paid: true,
        status_id: 1, // Оплачено
        paid_sum: Number(object.amount.value),
      },
    });

    // Создаем запись о финансовой операции
    await tx.deposit_transaction.create({
      data: {
        user_id: Number(metadata.userId),
        amount: Number(object.amount.value), // Положительное число, т.к. это приход
        current_balance: currentBalance, // Текущий баланс лояльности (он не меняется)
        booking_id: updatedBooking.booking_id,
        operation_type_id: 3, // Например, 3 - 'Внешняя оплата'
        admin_id: 0, // Системная запись
        external_transaction_id: object.id, // ID платежа из ЮKassa (типа '27d...')
        comment: `Оплата картой через ЮKassa. Бронь №${updatedBooking.booking_id}`,
        created_at: new Date(new Date().getTime() + 3 * 60 * 60 * 1000),
      },
    });

    // Здесь же можно начислить XP или отправить Email
    console.log(`Платеж ${paymentId} подтвержден!`);
  }

  res.sendStatus(200); // Обязательно отвечаем ЮKassa, что получили сигнал
};

const getBookingStatus = async (req, res) => {
  const { bookingId } = req.params;
  const booking = await prisma.booking.findUnique({
    where: { booking_id: Number(bookingId) },
  });

  res.json({ is_paid: booking.is_paid });
};

const getUserBookings = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Пользователь не авторизован' });
    }

    const { userId } = req.user; // Из middleware

    const bookings = await prisma.booking.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' }, // или booking_date + time_begin
      select: {
        booking_id: true,
        booking_date: true,
        time_begin: true,
        time_end: true,
        total_cost: true,
        is_paid: true,
        room: {
          select: {
            name: true,
            room_id: true, // название комнаты
          },
        },
        status_booking: {
          select: {
            name: true, // статус (Подтверждено, Отменено и т.д.)
          },
        },
      },
    });

    // Форматируем ответ для удобства на фронте
    const result = bookings.map((b) => ({
      id: b.booking_id,
      room_id: b.room.room_id,
      date: b.booking_date,
      timeBegin: b.time_begin.toISOString().slice(11, 16),
      timeEnd: b.time_end.toISOString().slice(11, 16),
      totalCost: b.total_cost,
      isPaid: b.is_paid,
      roomName: b.room?.name || '—',
      status: b.status_booking?.name || '—',
    }));

    res.json(result);
  } catch (err) {
    console.error('Ошибка получения истории бронирований:', err);
    res.status(500).json({ message: 'Не удалось получить историю бронирований' });
  }
};

const getTodayBookings = async (req, res) => {
  try {
    // Формируем сегодняшнюю дату по московскому времени (UTC+3)
    const nowMoscow = new Date(Date.now() + 3 * 60 * 60 * 1000); // вы уже используете этот сдвиг
    const todayStr = nowMoscow.toISOString().slice(0, 10); // "2026-05-17"

    //определяем филиал сотрудника
    const staffRecord = await prisma.work_shift.findFirst({
      where: {
        staff_id: req.user.userId,
        opened_at: {
          gte: new Date(`${todayStr}T00:00:00.000Z`),
          lte: new Date(`${todayStr}T23:59:59.999Z`),
        },
      },
    });

    const whereCondition = {
      booking_date: new Date(`${todayStr}T00:00:00.000Z`),
    };

    if (staffRecord) {
      whereCondition.room = { branch_id: staffRecord.branch_id };
    }

    const bookings = await prisma.booking.findMany({
      where: whereCondition,
      orderBy: [{ booking_date: 'asc' }, { time_begin: 'asc' }],
      include: {
        room: {
          select: { name: true, branch_office: { select: { address: true } } },
        },
        user: {
          select: { phone: true, user_info: { select: { name: true } } },
        },
        status_booking: {
          select: { name: true },
        },
      },
    });

    // Форматируем для фронта
    const result = bookings.map((b) => ({
      id: b.booking_id,
      date: b.booking_date,
      timeBegin: b.time_begin.toISOString().slice(11, 16),
      timeEnd: b.time_end.toISOString().slice(11, 16),
      totalCost: b.total_cost,
      isPaid: b.is_paid,
      roomId: b.room_id,
      roomName: b.room?.name || '—',
      branchAddress: b.room?.branch_office?.address || '—',
      clientName: b.user?.user_info?.name || '—',
      clientPhone: b.user?.phone || '—',
      status: b.status_booking?.name || '—',
    }));

    res.json(result);
  } catch (err) {
    console.error('Ошибка получения сегодняшних бронирований:', err);
    res.status(500).json({ message: 'Не удалось получить бронирования' });
  }
};

const startBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { userId } = req.user;

    // Получаем бронирование
    const booking = await prisma.booking.findUnique({
      where: { booking_id: Number(bookingId) },
      include: { status_booking: true },
    });

    if (!booking) {
      return res.status(404).json({ message: 'Бронирование не найдено' });
    }

    // Проверяем, что бронирование можно запустить
    const allowedStatuses = [1, 2, 6]; // Оплачено, Ожидает оплаты (онлайн), Ожидает оплаты (наличные)
    if (!allowedStatuses.includes(booking.status_id)) {
      return res.status(400).json({
        message: `Нельзя запустить бронирование со статусом "${booking.status_booking.name}"`,
      });
    }

    // Обновляем бронирование
    const updatedBooking = await prisma.booking.update({
      where: { booking_id: Number(bookingId) },
      data: {
        status_id: 7, // Выполняется
        is_paid: true,
        paid_sum: booking.total_cost,
      },
      include: {
        room: { select: { name: true } },
        status_booking: { select: { name: true } },
      },
    });

    // Логируем действие администратора
    const staffShift = await prisma.work_shift.findFirst({
      where: {
        staff_id: userId,
        closed_at: null, // открытая смена
      },
    });

    if (staffShift) {
      await prisma.admin_log.create({
        data: {
          admin_id: userId,
          target_user_id: booking.user_id,
          action_type: 'START_BOOKING',
          shift_id: staffShift.shift_id,
          created_at: new Date(Date.now() + 3 * 60 * 60 * 1000),
        },
      });
    }

    return res.status(200).json({
      message: 'Сеанс успешно запущен',
      booking: {
        id: updatedBooking.booking_id,
        status: updatedBooking.status_booking.name,
        isPaid: updatedBooking.is_paid,
        paidSum: updatedBooking.paid_sum,
        roomName: updatedBooking.room.name,
      },
    });
  } catch (err) {
    console.error('Ошибка при запуске бронирования:', err);
    return res.status(500).json({ message: 'Не удалось запустить бронирование' });
  }
};

const completeBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { userId } = req.user;

    const booking = await prisma.booking.findUnique({
      where: { booking_id: Number(bookingId) },
      include: { room: { include: { branch_office: true } } },
    });

    if (!booking) return res.status(404).json({ message: 'Бронирование не найдено' });
    if (booking.status_id !== 7)
      return res.status(400).json({ message: 'Можно завершить только активный сеанс' });

    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { booking_id: Number(bookingId) },
        data: { status_id: 3 },
      });

      // Базовое XP — работает для всех способов оплаты
      await awardBaseXp(tx, booking.user_id, Number(bookingId));

      // Доп. активности
      await checkActivities(tx, booking.user_id, {
        ...booking,
        branch_id: booking.room.branch_id,
      });

      // Лог
      const shift = await tx.work_shift.findFirst({
        where: { staff_id: userId, closed_at: null },
      });

      if (shift) {
        await tx.admin_log.create({
          data: {
            admin_id: userId,
            target_user_id: booking.user_id,
            action_type: 'COMPLETE_BOOKING',
            shift_id: shift.shift_id,
            created_at: new Date(Date.now() + 3 * 60 * 60 * 1000),
          },
        });
      }
    });

    return res.status(200).json({ message: 'Сеанс успешно завершён' });
  } catch (err) {
    console.error('Ошибка при завершении сеанса:', err);
    return res.status(500).json({ message: 'Не удалось завершить сеанс' });
  }
};

const cancelBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { userId } = req.user;

    const booking = await prisma.booking.findFirst({
      where: {
        booking_id: Number(bookingId),
      },
    });

    if (!booking) {
      return res.status(500).json({ message: 'Бронирование не найдено' });
    }

    if (booking.user_id != userId) {
      return res
        .status(500)
        .json({ message: 'Отменить бронирование может только клиент, который ее создал. ' });
    }

    // Проверяем, можно ли отменить (не завершено, не отменено ранее)
    if (booking.status_id === 4 || booking.status_id === 3) {
      return res.status(400).json({
        message: 'Это бронирование уже нельзя отменить',
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { booking_id: Number(bookingId) },
        data: { status_id: 4 },
      });

      // 2. Если бронь была оплачена депозитом – возвращаем деньги
      if (booking.is_paid && booking.paid_sum > 0) {
        // Находим транзакцию списания, связанную с этим бронированием
        const debitTx = await tx.deposit_transaction.findFirst({
          where: {
            booking_id: Number(bookingId),
            operation_type_id: 1, // id типа «списание за бронь»
          },
        });
        if (debitTx) {
          // 3. Создаём транзакцию возврата
          await tx.deposit_transaction.create({
            data: {
              user_id: userId,
              amount: booking.paid_sum,
              current_balance: {
                increment: booking.paid_sum,
              },
              booking_id: Number(bookingId),
              operation_type_id: 3, // id типа «возврат на депозит»
              comment: `Возврат за отмену бронирования #${bookingId}`,
            },
          });
          const deletedXpLogs = await tx.xp_log.findMany({
            where: { booking_id: Number(bookingId) },
            select: { xp_gain: true },
          });

          if (deletedXpLogs.length > 0) {
            // Удаляем записи
            await tx.xp_log.deleteMany({
              where: { booking_id: Number(bookingId) },
            });

            // Суммируем удалённый XP
            const totalXpRemoved = deletedXpLogs.reduce((sum, log) => sum + log.xp_gain, 0);

            // Уменьшаем баланс XP в loyalty
            await tx.loyalty.update({
              where: { user_id: userId },
              data: {
                xp_amount: {
                  decrement: totalXpRemoved,
                },
              },
            });
          }
        }
      }
    });

    return res.status(200).json({ message: 'Бронирование успешно отменено' });
  } catch (err) {
    console.error('Ошибка при отмене бронирования:', err);
    return res.status(500).json({ message: 'Не удалось отмениь бронирование' });
  }
};

export default {
  createBookingDeposit,
  createBookingExternal,
  createBookingCash,
  handleYookassaWebhook,
  getBookingStatus,
  getUserBookings,
  getTodayBookings,
  startBooking,
  completeBooking,
  cancelBooking,
};
