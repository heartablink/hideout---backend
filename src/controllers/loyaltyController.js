import prisma from '../config/db.js';

// Получить один уровень по ID (старый эндпоинт, оставляем)
const getLevel = async (req, res) => {
  try {
    const { level } = req.params;
    const levelLoyalty = await prisma.loyalty_level.findUnique({
      where: { level_id: Number(level) },
    });
    return res.status(200).json(levelLoyalty);
  } catch (err) {
    console.error('Ошибка при получении уровня', err);
    return res.status(500).json({ message: 'Не удалось загрузить уровень', error: err.message });
  }
};

// Получить все уровни лояльности (отсортированные по порядку)
const getAllLevels = async (req, res) => {
  try {
    const levels = await prisma.loyalty_level.findMany({
      orderBy: { level_order: 'asc' },
    });

    // Конвертируем BigInt в Number для сериализации
    const result = levels.map((l) => ({
      ...l,
      min_xp: Number(l.min_xp),
      discount: l.discount !== null ? Number(l.discount) : 0,
    }));

    return res.status(200).json(result);
  } catch (err) {
    console.error('Ошибка при получении уровней', err);
    return res.status(500).json({ message: 'Не удалось загрузить уровни', error: err.message });
  }
};

// Получить все типы активностей (за что начисляется XP)
const getAllActivities = async (req, res) => {
  try {
    const activities = await prisma.activity_type.findMany({
      orderBy: { activity_id: 'asc' },
    });
    return res.status(200).json(activities);
  } catch (err) {
    console.error('Ошибка при получении активностей', err);
    return res.status(500).json({ message: 'Не удалось загрузить активности', error: err.message });
  }
};

// Получить все пакеты пополнения (только активные)
const getAllPackages = async (req, res) => {
  try {
    const packages = await prisma.loyalty_package.findMany({
      where: { is_active: true },
      orderBy: { price: 'asc' },
    });

    const result = packages.map((p) => ({
      ...p,
      price: Number(p.price),
    }));

    return res.status(200).json(result);
  } catch (err) {
    console.error('Ошибка при получении пакетов', err);
    return res.status(500).json({ message: 'Не удалось загрузить пакеты', error: err.message });
  }
};

// Получить полную информацию о программе лояльности за один запрос
// (уровни + активности + пакеты) — оптимизация для фронта
const getLoyaltyInfo = async (req, res) => {
  try {
    const [levels, activities, packages] = await Promise.all([
      prisma.loyalty_level.findMany({ orderBy: { level_order: 'asc' } }),
      prisma.activity_type.findMany({ orderBy: { activity_id: 'asc' } }),
      prisma.loyalty_package.findMany({ where: { is_active: true }, orderBy: { price: 'asc' } }),
    ]);

    return res.status(200).json({
      levels: levels.map((l) => ({
        ...l,
        min_xp: Number(l.min_xp),
        discount: l.discount !== null ? Number(l.discount) : 0,
      })),
      activities,
      packages: packages.map((p) => ({ ...p, price: Number(p.price) })),
    });
  } catch (err) {
    console.error('Ошибка при получении данных лояльности', err);
    return res.status(500).json({ message: 'Не удалось загрузить данные', error: err.message });
  }
};

export default { getLevel, getAllLevels, getAllActivities, getAllPackages, getLoyaltyInfo };
