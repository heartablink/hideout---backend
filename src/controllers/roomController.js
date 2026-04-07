import prisma from '../config/db.js';

const getAllRooms = async (req, res) => {
  try {
    const { category, sortBy, maxPeople, branch } = req.query;
    const filters = {};
    if (category) {
      filters.category_id = Number(category);
    }

    if (branch) {
      filters.branch_id = Number(branch);
    }

    if (maxPeople) {
      filters.max_people = {
        gte: Number(maxPeople), // gte = "greater than or equal" (>=) --- сокращение prisma
        //сначала переводим строку в число
      };
    }

    // Логика сортировки
    let orderBy = { room_id: 'asc' }; // По умолчанию по ID
    if (sortBy === 'price_asc') orderBy = { price: 'asc' };
    if (sortBy === 'price_desc') orderBy = { price: 'desc' };

    // Запрос в базу
    const rooms = await prisma.room.findMany({
      where: filters,
      orderBy: orderBy,
      include: {
        category: {
          select: { name: true }, // только name категории
        },
        branch_office: {
          // или branch_office, как называется в вашей схеме
          select: { address: true }, // только address филиала
        },
      },
    });
    const roomsWithNames = rooms.map(({ category, branch_office, ...room }) => ({
      ...room,
      category_name: category.name,
      address: branch_office.address,
    }));

    return res.status(200).json(roomsWithNames);
  } catch (err) {
    console.error('Ошибка при получении комнат:', err);
    return res.status(500).json({
      message: 'Не удалось загрузить список комнат',
      error: err.message,
    });
  }
};

export default {
  getAllRooms,
};
