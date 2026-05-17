import prisma from '../config/db.js';

/**
 * Основная функция проверки активностей.
 * Вызывается ВНУТРИ транзакции в контроллере.
 */
export const checkActivities = async (tx, userId, currentBooking) => {
  // 1. Получаем данные текущей брони для простых проверок
  const startHour = new Date(currentBooking.time_begin).getHours();
  const endHours = new Date(currentBooking.time_end).getHours();
  const durationMs = new Date(currentBooking.time_end) - new Date(currentBooking.time_begin);
  const durationHours = durationMs / (1000 * 60 * 60);

  const bookingId = currentBooking.booking_id;

  // --- ПРОСТЫЕ УСЛОВИЯ (на основе текущей брони) ---

  // Ранняя пташка (ID: 1)
  if (startHour >= 10 && startHour < 12) {
    await awardOncePerBooking(tx, userId, 1, bookingId);
  }

  // Счастливые часы (ID: 2)
  const isWeekday = ![0, 6].includes(new Date().getDay());
  if (isWeekday && startHour < 17 && endHours > 14) {
    await awardOncePerBooking(tx, userId, 2, bookingId);
  }

  // Дневной безлимит (ID: 3)
  if (durationHours >= 5) {
    await awardOncePerBooking(tx, userId, 3, bookingId);
  }

  // --- СЛОЖНЫЕ УСЛОВИЯ (нужен анализ всей истории) ---

  // Получаем ВСЕ успешные брони пользователя для расчетов
  const userHistory = await tx.booking.findMany({
    where: {
      user_id: userId,
      status_id: 1, // Считаем только оплаченные
    },
    include: { room: true },
  });

  // 4. Локальный патриот (ID: 4) - последние 10 броней в одном офисе
  if (userHistory.length >= 10) {
    const last10 = userHistory.slice(-10);
    const branchId = currentBooking.branch_id;
    const isPatriot = last10.every((b) => b.room.branch_id === branchId);
    if (isPatriot) await awardOnce(tx, userId, 4);
  }

  // 5. Завоеватель сети (ID: 5) - посетил все 4 офиса
  const uniqueBranches = new Set(userHistory.map((b) => b.room.branch_id));
  if (uniqueBranches.size >= 4) {
    await awardOnce(tx, userId, 5);
  }

  // 7 и 8. Киберспортсмен (100ч) и Легенда Hideout (500ч)
  const totalPlayTimeMs = userHistory.reduce((acc, b) => {
    return acc + (new Date(b.time_end) - new Date(b.time_begin));
  }, 0);
  const totalPlayHours = totalPlayTimeMs / (1000 * 60 * 60);

  if (totalPlayHours >= 100) await awardOnce(tx, userId, 7);
  if (totalPlayHours >= 500) await awardOnce(tx, userId, 8);
};

/**
 * Проверка на "Щедрый депозит" (ID: 6).
 * Вызывается в контроллере ПОПОЛНЕНИЯ БАЛАНСА.
 */
export const checkDepositActivity = async (tx, userId, amount) => {
  if (amount >= 3000) {
    await awardOnce(tx, userId, 6);
  }
};

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

// Начисляет XP, если такая активность еще никогда не выполнялась (для ачивок)
async function awardOnce(tx, userId, activityId) {
  const alreadyExist = await tx.xp_log.findFirst({
    where: { user_id: userId, activity_type_id: activityId },
  });

  if (!alreadyExist) {
    const activity = await tx.activity_type.findUnique({ where: { activity_id: activityId } });

    await tx.xp_log.create({
      data: {
        user_id: userId,
        xp_gain: activity.xp_reward,
        activity_type_id: activityId,
        created_at: new Date(new Date().getTime() + 3 * 60 * 60 * 1000),
      },
    });

    await tx.loyalty.update({
      where: { user_id: userId },
      data: { xp_amount: { increment: activity.xp_reward } },
    });
  }
}

// Начисляет XP просто за факт брони (можно получать много раз)
async function awardOncePerBooking(tx, userId, activityId, bookingId) {
  const activity = await tx.activity_type.findUnique({ where: { activity_id: activityId } });
  await tx.xp_log.create({
    data: {
      user_id: userId,
      xp_gain: activity.xp_reward,
      activity_type_id: activityId,
      booking_id: bookingId,
      created_at: new Date(new Date().getTime() + 3 * 60 * 60 * 1000),
    },
  });
  await tx.loyalty.update({
    where: { user_id: userId },
    data: { xp_amount: { increment: activity.xp_reward } },
  });
}

// src/services/loyaltyService.js

// Базовое начисление за завершённую бронь — можно получать каждый раз
export const awardBaseXp = async (tx, userId, bookingId) => {
  // Проверяем, не начислено ли уже за эту бронь
  const alreadyAwarded = await tx.xp_log.findFirst({
    where: {
      user_id: userId,
      booking_id: bookingId,
      activity_type_id: 9,
    },
  });

  if (alreadyAwarded) return; // защита от двойного начисления

  const activity = await tx.activity_type.findUnique({
    where: { activity_id: 9 },
  });

  if (!activity) return;

  await tx.xp_log.create({
    data: {
      user_id: userId,
      xp_gain: activity.xp_reward,
      activity_type_id: 9,
      booking_id: bookingId,
      created_at: new Date(Date.now() + 3 * 60 * 60 * 1000),
    },
  });

  await tx.loyalty.update({
    where: { user_id: userId },
    data: { xp_amount: { increment: activity.xp_reward } },
  });

  // Проверяем повышение уровня
  await checkLevelUp(tx, userId);
};

// Проверка и повышение уровня лояльности
const checkLevelUp = async (tx, userId) => {
  const loyalty = await tx.loyalty.findUnique({
    where: { user_id: userId },
    include: { loyalty_level: true },
  });

  // Находим следующий уровень по xp
  const nextLevel = await tx.loyalty_level.findFirst({
    where: {
      min_xp: { lte: loyalty.xp_amount },
      level_order: { gt: loyalty.loyalty_level.level_order },
    },
    orderBy: { level_order: 'asc' },
  });

  if (nextLevel) {
    await tx.loyalty.update({
      where: { user_id: userId },
      data: { loyalty_level_id: nextLevel.level_id },
    });
    console.log(`Пользователь ${userId} повышен до уровня "${nextLevel.name}"`);
  }
};

export default { checkActivities, checkDepositActivity, awardBaseXp };
