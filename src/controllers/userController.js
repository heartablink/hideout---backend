import prisma from '../config/db.js';

const getMe = async (req, res) => {
  try {
    const { userId } = req.user;

    const user = await prisma.user.findFirst({
      where: { user_id: Number(userId) },
      select: {
        phone: true,

        loyalty: {
          select: { loyalty_level_id: true, xp_amount: true },
        },
        user_info: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    const lvlData = await prisma.loyalty_level.findFirst({
      where: { level_id: user.loyalty?.loyalty_level_id },
    });

    // Берём последнюю транзакцию пользователя — в ней актуальный баланс
    const lastTransaction = await prisma.deposit_transaction.findFirst({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      select: { current_balance: true },
    });

    const bookings = await prisma.booking.findMany({
      where: {
        user_id: userId,
        is_paid: true,
        status_id: 3,
      },
    });

    // 2. Считаем общее количество миллисекунд
    // Считаем общее количество миллисекунд
    const totalMs = bookings.reduce((acc, booking) => {
      // time_begin и time_end уже объекты Date — используем напрямую
      const start = new Date(booking.time_begin);
      const end = new Date(booking.time_end);

      const diff = end - start;
      // Защита от некорректных данных (end раньше start)
      return acc + (diff > 0 ? diff : 0);
    }, 0);

    // Переводим миллисекунды в часы
    const totalHours = Math.floor(totalMs / (1000 * 60 * 60));

    // Безопасный сбор данных
    const userData = {
      phone: user.phone,
      user_info: user.user_info,
      loyalty_level: user.loyalty?.loyalty_level_id || null,
      current_balance: lastTransaction ? Number(lastTransaction.current_balance) : 0,
      xp_amount: user.loyalty?.xp_amount ?? 0,
      discount: lvlData.discount,
      totalHours,
      level_name: lvlData.name,
      level_min_xp: lvlData.min_xp,
      level_max_xp: lvlData.max_xp,
      lvl_photo: lvlData.photo,
    };

    delete userData.loyalty;

    res.status(201).json(userData);
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: 'Не удалось получить информацию о пользователе' });
  }
};

const getXpLogs = async (req, res) => {
  const { userId } = req.user;
  const logs = await prisma.xp_log.findMany({
    where: { user_id: userId },
    include: { activity_type: { select: { name: true } } },
    orderBy: { created_at: 'desc' },
  });
  res.json(logs.map((l) => ({ ...l, name: l.activity_type?.name })));
};

const getTransactions = async (req, res) => {
  const { userId } = req.user;
  const data = await prisma.deposit_transaction.findMany({
    where: { user_id: userId },
    orderBy: { created_at: 'desc' },
  });
  res.json(data);
};
const updateMe = async (req, res) => {
  try {
    const { userId } = req.user;
    const { name, surname, phone } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ message: 'Имя не может быть пустым' });
    }

    // Валидация телефона если передан
    if (phone) {
      const cleaned = String(phone).replace(/\D/g, '');
      if (cleaned.length !== 11) {
        return res.status(400).json({ message: 'Некорректный номер телефона' });
      }
      const existing = await prisma.user.findFirst({
        where: { phone: cleaned, NOT: { user_id: userId } },
      });
      if (existing) {
        return res.status(400).json({ message: 'Этот номер телефона уже используется' });
      }
    }

    // Обновляем user_info и при необходимости user — в транзакции
    const result = await prisma.$transaction(async (tx) => {
      const updatedInfo = await tx.user_info.update({
        where: { user_id: userId },
        data: {
          name: name.trim(),
          surname: surname?.trim() ?? '',
        },
      });

      let updatedPhone = null;
      if (phone !== undefined) {
        const cleaned = String(phone).replace(/\D/g, '');
        const updatedUser = await tx.user.update({
          where: { user_id: userId },
          data: { phone: cleaned },
        });
        updatedPhone = updatedUser.phone;
      }

      return { updatedInfo, updatedPhone };
    });

    return res.status(200).json({
      name: result.updatedInfo.name,
      surname: result.updatedInfo.surname,
      phone: result.updatedPhone, // null если не менялся
    });
  } catch (err) {
    console.error('Ошибка обновления профиля:', err);
    return res.status(500).json({ message: 'Не удалось обновить профиль' });
  }
};

const deleteMe = async (req, res) => {
  try {
    const { userId } = req.user;

    // Мягкое удаление — просто ставим флаг
    await prisma.user_info.update({
      where: { user_id: userId },
      data: { is_deleted: true },
    });

    return res.status(200).json({ message: 'Профиль удалён' });
  } catch (err) {
    console.error('Ошибка удаления профиля:', err);
    return res.status(500).json({ message: 'Не удалось удалить профиль' });
  }
};

export default { getMe, getXpLogs, getTransactions, updateMe, deleteMe };
