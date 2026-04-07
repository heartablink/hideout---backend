import prisma from '../config/db.js';

const getCategories = async (req, res) => {
  try {
    const categories = await prisma.category.findMany({});

    return res.status(200).json(categories);
  } catch (err) {
    console.error('Ошибка при получении категорий', err);
    return res.status(500).json({
      message: 'Не удалось загрузить список категорий',
      error: err.message,
    });
  }
};
export default { getCategories };
