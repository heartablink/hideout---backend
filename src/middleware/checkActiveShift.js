import prisma from '../config/db.js';

const checkActiveShift = async (req, res, next) => {
  try {
    const { userId } = req.user; // checkAuth должен быть до этого middleware

    const activeShift = await prisma.work_shift.findFirst({
      where: {
        staff_id: userId,
        closed_at: null, // смена не закрыта = активна
      },
    });

    if (!activeShift) {
      return res.status(403).json({
        message: 'Действие недоступно: сначала откройте рабочую смену',
      });
    }

    req.shift = activeShift; // кладём смену в запрос — пригодится для admin_log
    next();
  } catch (err) {
    console.error('Ошибка проверки смены:', err);
    return res.status(500).json({ message: 'Ошибка сервера при проверке смены' });
  }
};

export default checkActiveShift;
