import prisma from '../config/db.js';

/* GET /api/staff/me — данные текущего сотрудника */
const getStaffMe = async (req, res) => {
  try {
    const { userId } = req.user;

    const user = await prisma.user.findUnique({
      where: { user_id: userId },
      select: {
        phone: true,
        user_info: { select: { name: true, surname: true } },
        staff: {
          include: { branch_office: { select: { address: true } } },
        },
      },
    });

    if (!user) return res.status(404).json({ message: 'Сотрудник не найден' });

    res.json({
      name: user.user_info?.name || '',
      surname: user.user_info?.surname || '',
      phone: user.phone,
      branch_address: user.staff?.branch_office?.address || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};

/* GET /api/staff/shifts — история смен текущего сотрудника */
const getStaffShifts = async (req, res) => {
  try {
    const { userId } = req.user;

    const shifts = await prisma.work_shift.findMany({
      where: { staff_id: userId },
      orderBy: { opened_at: 'desc' },
    });

    res.json(shifts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};

/* GET /api/staff/logs — журнал действий текущего сотрудника */
const getStaffLogs = async (req, res) => {
  try {
    const { userId } = req.user;

    const logs = await prisma.admin_log.findMany({
      where: { admin_id: userId },
      orderBy: { created_at: 'desc' },
      take: 200,
    });

    res.json(logs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};

/* POST /api/staff/shift/open — открыть смену */
const openShift = async (req, res) => {
  try {
    const { userId } = req.user;

    // Проверяем — нет ли уже открытой смены
    const existing = await prisma.work_shift.findFirst({
      where: { staff_id: userId, closed_at: null },
    });
    if (existing) return res.status(400).json({ message: 'Смена уже открыта' });

    const staff = await prisma.staff.findUnique({ where: { user_id: userId } });
    if (!staff) return res.status(404).json({ message: 'Сотрудник не найден' });

    const ip =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown';

    const shift = await prisma.work_shift.create({
      data: {
        staff_id: userId,
        branch_id: staff.branch_id,
        ip_address: ip,
        opened_at: new Date(),
      },
    });

    res.status(201).json(shift);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка открытия смены' });
  }
};

/* POST /api/staff/shift/close — закрыть смену */
const closeShift = async (req, res) => {
  try {
    const { userId } = req.user;

    const shift = await prisma.work_shift.findFirst({
      where: { staff_id: userId, closed_at: null },
    });
    if (!shift) return res.status(404).json({ message: 'Открытой смены не найдено' });

    const updated = await prisma.work_shift.update({
      where: { shift_id: shift.shift_id },
      data: { closed_at: new Date() },
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка закрытия смены' });
  }
};

export default { getStaffMe, getStaffShifts, getStaffLogs, openShift, closeShift };
