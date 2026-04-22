import { error } from 'node:console';
import prisma from '../config/db.js';
import { now } from 'sequelize/lib/utils';
import { checkActivities } from '../services/loyaltyService.js';

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
    const sortedSlots = slots.sort();
    const timeBegin = new Date(`${date}T${sortedSlots[0]}:00Z`);
    const timeEnd = new Date(`${date}T${sortedSlots[sortedSlots.length - 1]}:00Z`);
    timeEnd.setUTCHours(timeEnd.getUTCHours() + 1);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Проверка на двойное бронирование
      const existing = await tx.booking.findFirst({
        where: {
          room_id: Number(roomId),
          booking_date: new Date(date),
          status_booking: { name: { in: ['Оплачено', 'Ожидает оплаты'] } },
          OR: [{ time_begin: { lt: timeEnd, gte: timeBegin } }],
        },
      });

      if (existing) throw new Error('Один из выбранных слотов уже занят');

      // 2. Получаем данные комнаты и лояльности юзера (с уровнем)
      const room = await tx.room.findFirst({
        where: { room_id: Number(roomId) },
        include: { branch_office: true },
      });

      const userLoyalty = await tx.loyalty.findUnique({
        where: { user_id: userId },
        include: { loyalty_level: true }, // Обязательно подтягиваем уровень для скидки
      });

      // 3. РАСЧЕТ СКИДКИ
      const basePrice = Number(room.price) * slots.length;
      const discountPercent = Number(userLoyalty.loyalty_level.discount) || 0;

      // Итоговая сумма к списанию
      const totalPrice = basePrice * (1 - discountPercent);

      // 4. Проверка баланса
      if (Number(userLoyalty.current_balance) < totalPrice) {
        throw new Error(
          `Недостаточно средств. Нужно ${totalPrice}, на счету ${userLoyalty.current_balance}`,
        );
      }

      // 5. Создание бронирования
      const booking = await tx.booking.create({
        data: {
          user_id: userId,
          room_id: Number(roomId),
          booking_date: new Date(date),
          time_begin: timeBegin,
          time_end: timeEnd,
          total_cost: basePrice, // Исходная цена
          paid_sum: totalPrice, // Сколько реально заплатил со скидкой
          is_paid: true,
          status_id: 1,
          created_at: new Date(new Date().getTime() + 3 * 60 * 60 * 1000),
        },
      });

      // 6. Списание и запись транзакции
      const updatedLoyalty = await tx.loyalty.update({
        where: { user_id: userId },
        data: { current_balance: { decrement: totalPrice } },
      });

      await tx.deposit_transaction.create({
        data: {
          user_id: userId,
          amount: -totalPrice,
          current_balance: updatedLoyalty.current_balance,
          booking_id: booking.booking_id,
          operation_type_id: 2,
          admin_id: userId,
          created_at: new Date(new Date().getTime() + 3 * 60 * 60 * 1000),
          comment: 'Оплата бронирования со игрового счета',
        },
      });

      // 7. Проверка активностей (XP начисляем от РЕАЛЬНО потраченных денег)
      await checkActivities(tx, userId, {
        ...booking,
        branch_id: room.branch_id,
      });

      return {
        booking,
        discountApplied: `${discountPercent * 100}%`,
        saved: basePrice - totalPrice,
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

      //---------------------------
      // Создаем платеж в ЮKassa
      const idempotenceKey = uuidv4();
      const payment = await checkout.createPayment(
        {
          amount: {
            value: newBooking.total_cost.toFixed(2),
            currency: 'RUB',
          },
          confirmation: {
            type: 'redirect',
            // ВАЖНО: прокидываем ID брони в URL возврата
            return_url: `http://localhost:3000/booking/success?bookingId=${newBooking.booking_id}`,
          },
          description: `Оплата бронирования №${newBooking.booking_id} (Комната: ${roomId})`,
          metadata: {
            bookingId: newBooking.booking_id,
            userId: userId,
          },
          capture: true,
        },
        idempotenceKey,
      );
      //---------------------------

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

export default {
  createBookingDeposit,
  createBookingExternal,
  handleYookassaWebhook,
  getBookingStatus,
};
