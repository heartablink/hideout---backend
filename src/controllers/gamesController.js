import prisma from '../config/db.js';

const getGames = async (req, res) => {
  try {
    const { limit, category } = req.query;

    const filters = {};

    if (category) {
      filters.category_id = Number(category);
    }

    const games = await prisma.game.findMany({
      where: filters,
      take: limit ? Number(limit) : undefined, // Если limit пришел (9), берем 9. Если нет — берем все.
      orderBy: { game_id: 'asc' },
    });

    return res.status(200).json(games);
  } catch (err) {
    console.error('Ошибка при получении игр', err);
    return res.status(500).json({
      message: 'Не удалось загрузить список игр',
      error: err.message,
    });
  }
};

export default { getGames };
