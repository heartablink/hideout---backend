import { error } from 'node:console';
import prisma from '../config/db.js';
import { now } from 'sequelize/lib/utils';
import { checkActivities } from '../services/loyaltyService.js';

const createBooking = async (req, res) => {
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
    const { userId, role } = req.user;
    const { roomId, date, slots } = req.body;

    if (role !== 'Client') {
      return res.status(403).json({ message: 'Только клиенты могут бронировать' });
    }

    const sortedSlots = slots.sort();
    const timeBegin = new Date(`${date}T${sortedSlots[0]}:00`);
    const timeEnd = new Date(`${date}T${sortedSlots[sortedSlots.length - 1]}:00`);
    timeEnd.setHours(timeEnd.getHours() + 1);

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

      const room = await tx.room.findUnique({
        where: { room_id: Number(roomId) },
        include: { branch_office: true },
      });
      const totalPrice = Number(room.price) * slots.length;

      // --- ИМИТАЦИЯ ВНЕШНЕЙ ОПЛАТЫ ---
      // В реальной жизни здесь был бы запрос к API платежки
      const mockExternalId = `PAY_CARD_${Math.random().toString(36).substring(7).toUpperCase()}`;

      // 2. Создаем бронирование
      const booking = await tx.booking.create({
        data: {
          user_id: userId,
          room_id: Number(roomId),
          booking_date: new Date(date),
          time_begin: timeBegin,
          time_end: timeEnd,
          total_cost: totalPrice,
          paid_sum: totalPrice,
          is_paid: true,
          status_id: 1, // 'Оплачено'
        },
      });

      // 3. Записываем транзакцию (external_transaction_id ОБЯЗАТЕЛЕН)
      const currentLoyalty = await tx.loyalty.findUnique({ where: { user_id: userId } });

      await tx.deposit_transaction.create({
        data: {
          user_id: userId,
          amount: -totalPrice,
          current_balance: currentLoyalty.current_balance, // Баланс не менялся!
          booking_id: booking.booking_id,
          operation_type_id: 3, // Допустим, 3 - 'Оплата картой'
          admin_id: userId,
          external_transaction_id: mockExternalId,
          created_at: new Date(),
        },
      });

      // 4. Проверяем "Щедрый депозит" (так как деньги пришли извне)
      await checkDepositActivity(tx, userId, totalPrice);

      // 5. Проверяем игровые активности (Ранняя пташка, Киберспортсмен и т.д.)
      await checkActivities(tx, userId, {
        ...booking,
        branch_id: room.branch_id,
      });

      return booking;
    });

    res.status(201).json({ message: 'Оплата картой прошла успешно', result });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

export default { createBooking, createBookingExternal };
