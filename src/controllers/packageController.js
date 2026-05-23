import prisma from '../config/db.js';

// Поиск клиента по номеру телефона
const searchClient = async (req, res) => {
  try {
    const { phone } = req.query;

    if (!phone || phone.length < 5) {
      return res.status(400).json({ message: 'Введите номер телефона' });
    }

    const user = await prisma.user.findFirst({
      where: {
        phone: { contains: phone },
      },
      select: {
        user_id: true,
        phone: true,
        user_info: { select: { name: true, surname: true } },
        loyalty: {
          select: {
            xp_amount: true,
            loyalty_level: { select: { name: true } },
          },
        },
        permission: { select: { role_id: true } },
      },
    });

    if (!user) {
      return res.status(404).json({ message: 'Клиент не найден' });
    }

    // Получаем актуальный баланс из последней транзакции
    const lastTx = await prisma.deposit_transaction.findFirst({
      where: { user_id: user.user_id },
      orderBy: { created_at: 'desc' },
      select: { current_balance: true },
    });

    const CLIENT_ROLE_ID = 3;
    const roleIds = user.permission?.map((p) => p.role_id) || [];
    const isClient = roleIds.includes(CLIENT_ROLE_ID);
    const roleName = isClient ? 'клиент' : 'сотрудник';

    return res.json({
      userId: user.user_id,
      phone: user.phone,
      name: `${user.user_info?.name ?? ''} ${user.user_info?.surname ?? ''}`.trim(),
      role: roleName,
      levelName: user.loyalty?.loyalty_level?.name ?? '—',
      xp: user.loyalty?.xp_amount ?? 0,
      balance: lastTx ? Number(lastTx.current_balance) : 0,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Ошибка поиска клиента' });
  }
};

// Список пакетов из БД
const getPackages = async (req, res) => {
  try {
    const packages = await prisma.loyalty_package.findMany({
      where: { is_active: true },
      orderBy: { price: 'asc' },
    });
    return res.json(packages);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Ошибка загрузки пакетов' });
  }
};

// Подтверждение покупки (администратор принял наличные)
const purchasePackage = async (req, res) => {
  try {
    const { adminId } = req.user.userId;
    const { userId, packageId } = req.body;

    if (!userId || !packageId) {
      return res.status(400).json({ message: 'Не указан клиент или пакет' });
    }

    const pkg = await prisma.loyalty_package.findUnique({
      where: { package_id: Number(packageId) },
    });

    if (!pkg || !pkg.is_active) {
      return res.status(404).json({ message: 'Пакет не найден или неактивен' });
    }

    // Получаем текущий баланс клиента
    const lastTx = await prisma.deposit_transaction.findFirst({
      where: { user_id: Number(userId) },
      orderBy: { created_at: 'desc' },
      select: { current_balance: true },
    });

    const currentBalance = lastTx ? Number(lastTx.current_balance) : 0;
    const newBalance = currentBalance + Number(pkg.price);

    // Открытая смена администратора
    const shift = await prisma.work_shift.findFirst({
      where: {
        staff_id: req.user.userId,
        closed_at: null,
      },
    });

    await prisma.$transaction(async (tx) => {
      // Записываем транзакцию пополнения
      await tx.deposit_transaction.create({
        data: {
          user_id: Number(userId),
          amount: Number(pkg.price),
          current_balance: newBalance,
          operation_type_id: 1, // пополнение
          admin_id: req.user.userId,
          package_id: Number(packageId),
          comment: `Покупка пакета «${pkg.name}» (наличные). Администратор #${req.user.userId}`,
          created_at: new Date(Date.now() + 3 * 60 * 60 * 1000),
        },
      });

      // Логируем действие
      if (shift) {
        await tx.admin_log.create({
          data: {
            admin_id: req.user.userId,
            target_user_id: Number(userId),
            action_type: 'PACKAGE_PURCHASE',
            shift_id: shift.shift_id,
            created_at: new Date(Date.now() + 3 * 60 * 60 * 1000),
          },
        });
      }
    });

    return res.json({
      message: `Пакет «${pkg.name}» успешно куплен`,
      newBalance,
      packageName: pkg.name,
      amount: Number(pkg.price),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Ошибка при покупке пакета' });
  }
};

export default { searchClient, getPackages, purchasePackage };
