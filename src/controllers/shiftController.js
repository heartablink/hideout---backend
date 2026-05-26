//контроллер смен
import prisma from '../config/db.js';

//ОТКРЫТИЕ СМЕНЫ
const openShift = async (req, res) => {
  try {
    const { userId } = req.user;

    // 1. Проверяем, что пользователь является сотрудником
    const staffRecord = await prisma.staff.findUnique({
      where: { user_id: userId },
      include: { branch_office: true },
    });

    if (!staffRecord) {
      return res.status(403).json({ message: 'Вы не являетесь сотрудником клуба' });
    }

    // 2. Определяем роль текущего пользователя
    const permission = await prisma.permission.findFirst({
      where: { user_id: userId },
      include: { role: true },
    });
    const currentRole = permission?.role?.name_role;

    if (!currentRole) {
      return res.status(403).json({ message: 'Роль пользователя не определена' });
    }

    // 3. Проверяем, нет ли уже открытой смены у этого сотрудника
    const existingShift = await prisma.work_shift.findFirst({
      where: {
        staff_id: userId,
        closed_at: null,
      },
    });

    if (existingShift) {
      return res.status(400).json({
        message: 'У вас уже есть открытая смена',
        shift: {
          shiftId: existingShift.shift_id,
          openedAt: existingShift.opened_at,
          branchId: existingShift.branch_id,
        },
      });
    }

    // 4. Проверяем, нет ли другой открытой смены в этом филиале
    //    у сотрудника с ТАКОЙ ЖЕ ролью (в каждом филиале может быть
    //    одновременно один Администратор и один Управляющий)
    const branchStaffWithSameRole = await prisma.staff.findMany({
      where: {
        branch_id: staffRecord.branch_id,
        user_id: { not: userId },
        user: {
          permission: {
            some: { role: { name_role: currentRole } },
          },
        },
      },
      select: { user_id: true },
    });

    const sameRoleUserIds = branchStaffWithSameRole.map((s) => s.user_id);

    if (sameRoleUserIds.length > 0) {
      const conflictShift = await prisma.work_shift.findFirst({
        where: {
          branch_id: staffRecord.branch_id,
          staff_id: { in: sameRoleUserIds },
          closed_at: null,
        },
        include: {
          user: {
            select: { user_info: { select: { name: true, surname: true } } },
          },
        },
      });

      if (conflictShift) {
        const name = conflictShift.user.user_info?.name ?? '';
        const surname = conflictShift.user.user_info?.surname ?? '';
        return res.status(400).json({
          message: `В этом филиале уже открыта смена ${currentRole}а — ${name} ${surname}`.trim(),
        });
      }
    }

    // 5. Получаем IP адрес
    const ipAddress =
      req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';

    // 6. Открываем смену
    const newShift = await prisma.work_shift.create({
      data: {
        staff_id: userId,
        branch_id: staffRecord.branch_id,
        ip_address: ipAddress,
        opened_at: new Date(Date.now() + 3 * 60 * 60 * 1000),
      },
    });

    return res.status(201).json({
      message: 'Смена успешно открыта',
      shift: {
        shiftId: newShift.shift_id,
        openedAt: newShift.opened_at,
        branchAddress: staffRecord.branch_office.address,
        ipAddress: newShift.ip_address,
      },
    });
  } catch (err) {
    console.error('Ошибка при открытии смены:', err);
    return res.status(500).json({ message: 'Не удалось открыть смену' });
  }
};

//ЗАКРЫТИЕ СМЕНЫ
const closeShift = async (req, res) => {
  try {
    const { userId } = req.user;

    // 1. Ищем открытую смену сотрудника
    const openShift = await prisma.work_shift.findFirst({
      where: {
        staff_id: userId,
        closed_at: null,
      },
    });

    if (!openShift) {
      return res.status(400).json({ message: 'Открытой смены не найдено' });
    }

    // 2. Определяем роль текущего пользователя
    const permission = await prisma.permission.findFirst({
      where: { user_id: userId },
      include: { role: true },
    });
    const currentRole = permission?.role?.name_role;

    // 3. Для администраторов проверяем активные бронирования
    if (currentRole === 'Администратор') {
      const nowMoscow = new Date(Date.now() + 3 * 60 * 60 * 1000);
      const todayStr = nowMoscow.toISOString().slice(0, 10);

      const activeBookings = await prisma.booking.findMany({
        where: {
          status_id: { in: [7, 1, 2, 6] },
          room: { branch_id: openShift.branch_id },
          booking_date: new Date(`${todayStr}T00:00:00.000Z`),
        },
      });

      if (activeBookings.length > 0) {
        return res.status(400).json({
          message: `Нельзя закрыть смену: есть ${activeBookings.length} активных и запланированных сеансов на сегодня`,
        });
      }
    }

    // 4. Закрываем смену
    const closedShift = await prisma.work_shift.update({
      where: { shift_id: openShift.shift_id },
      data: {
        closed_at: new Date(Date.now() + 3 * 60 * 60 * 1000),
      },
    });

    const durationMs = closedShift.closed_at - closedShift.opened_at;
    const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
    const durationMinutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

    return res.status(200).json({
      message: 'Смена успешно закрыта',
      shift: {
        shiftId: closedShift.shift_id,
        openedAt: closedShift.opened_at,
        closedAt: closedShift.closed_at,
        duration: `${durationHours}ч ${durationMinutes}мин`,
      },
    });
  } catch (err) {
    console.error('Ошибка при закрытии смены:', err);
    return res.status(500).json({ message: 'Не удалось закрыть смену' });
  }
};
//ПОЛУЧИТЬ СТАТУС СМЕНЫ
const getShiftStatus = async (req, res) => {
  try {
    const { userId } = req.user;

    const shift = await prisma.work_shift.findFirst({
      where: {
        staff_id: userId,
        closed_at: null,
      },
      include: {
        branch_office: { select: { address: true } },
      },
    });

    return res.status(200).json({
      isOpen: !!shift,
      shift: shift
        ? {
            shiftId: shift.shift_id,
            openedAt: shift.opened_at,
            branchAddress: shift.branch_office.address,
          }
        : null,
    });
  } catch (err) {
    console.error('Ошибка при получении статуса смены:', err);
    return res.status(500).json({ message: 'Не удалось получить статус смены' });
  }
};

export default { openShift, closeShift, getShiftStatus };
