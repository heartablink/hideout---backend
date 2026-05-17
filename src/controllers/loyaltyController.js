import prisma from '../config/db.js';

const getLevel = async (req, res) => {
  try {
    const { level } = req.params;
    const levelLoyalty = await prisma.loyalty_level.findUnique({
      where: {
        // 2. ОБЯЗАТЕЛЬНО переводим в число
        level_id: Number(level),
      },
    });

    return res.status(200).json(levelLoyalty);
  } catch (err) {
    console.error('Ошибка при получении игр', err);
    return res.status(500).json({
      message: 'Не удалось загрузить список игр',
      error: err.message,
    });
  }
};

export default { getLevel };
