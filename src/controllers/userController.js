import prisma from '../config/db.js';

const getMe = async (req, res) => {
  try {
    const { userId } = req.user;

    const user = await prisma.user.findFirst({
      where: { user_id: Number(userId) },
      select: {
        phone: true,

        loyalty: {
          select: { loyalty_level_id: true, current_balance: true },
        },
        user_info: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    const lvlDiscount = await prisma.loyalty_level.findFirst({
      where: { level_id: user.loyalty?.loyalty_level_id },
    });

    // Безопасный сбор данных
    const userData = {
      phone: user.phone,
      user_info: user.user_info,
      // Если loyalty есть — берем ID, если нет — ставим null или 0
      loyalty_level: user.loyalty?.loyalty_level_id || null,
      // Если loyalty есть — берем баланс, если нет — ставим 0
      current_balance: user.loyalty?.current_balance ? Number(user.loyalty.current_balance) : 0,
      discount: lvlDiscount.discount,
    };

    delete userData.loyalty;

    res.status(201).json(userData);
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: 'Не удалось получить информацию о пользователе' });
  }
};

export default { getMe };
