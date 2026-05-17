import prisma from '../config/db.js';

const getMe = async (req, res) => {
  try {
    const { userId } = req.user;

    const user = await prisma.user.findFirst({
      where: { user_id: Number(userId) },
      select: {
        phone: true,

        loyalty: {
          select: { loyalty_level_id: true, current_balance: true, xp_amount: true },
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

    const bookings = await prisma.booking.findMany({
      where: {
        user_id: userId,
        is_paid: true,
      },
    });

    // 2. Считаем общее количество миллисекунд
    const totalMs = bookings.reduce((acc, booking) => {
      // Создаем объекты даты для корректного вычисления разницы
      // Так как у тебя time_begin и time_end — это тип Time,
      // мы добавим их к любой дате (например, сегодня), чтобы вычесть одно из другого
      const start = new Date(`1970-01-01T${booking.time_begin}`);
      const end = new Date(`${booking.time_end}`);

      return acc + (end - start);
    }, 0);

    // 3. Переводим миллисекунды в часы
    const totalHours = Math.floor(totalMs / (1000 * 60 * 60));

    // Безопасный сбор данных
    const userData = {
      phone: user.phone,
      user_info: user.user_info,
      // Если loyalty есть — берем ID, если нет — ставим null или 0
      loyalty_level: user.loyalty?.loyalty_level_id || null,
      // Если loyalty есть — берем баланс, если нет — ставим 0
      current_balance: user.loyalty?.current_balance ? Number(user.loyalty.current_balance) : 0,
      xp_amount: user.loyalty?.xp_amount ? user.loyalty.xp_amount : 0,
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

export default { getMe };
