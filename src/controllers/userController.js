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

export default { getMe, getXpLogs, getTransactions };
