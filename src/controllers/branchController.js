import prisma from '../config/db.js';

const getBranches = async (req, res) => {
  try {
    const branches = await prisma.branch_office.findMany({});

    return res.status(200).json(branches);
  } catch (err) {
    console.error('Ошибка при получении адрессов', err);
    return res.status(500).json({
      message: 'Не удалось загрузить список адрессов',
      error: err.message,
    });
  }
};

export default { getBranches };
