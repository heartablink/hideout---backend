import prisma from '../config/db.js';

// Словарь типов действий
export const ACTION_TYPES = {
  1: 'Создание бронирования',
  2: 'Отмена бронирования',
  3: 'Подтверждение оплаты',
  4: 'Пополнение депозита клиента',
  5: 'Закрытие комнаты',
  6: 'Открытие комнаты',
  7: 'Гостевое бронирование',
  8: 'Начало сеанса',
  9: 'Отметка неявки клиента',
};

const getBranchLogs = async (req, res) => {
  try {
    const { userId } = req.user;
    const { staffId, dateFrom, dateTo, page = 1, limit = 30 } = req.query;

    // Определяем филиал управляющего
    const staffRecord = await prisma.staff.findUnique({
      where: { user_id: userId },
    });
    if (!staffRecord) {
      return res.status(403).json({ message: 'Сотрудник не найден' });
    }

    // Находим всех сотрудников этого филиала
    const branchStaff = await prisma.staff.findMany({
      where: { branch_id: staffRecord.branch_id },
      select: { user_id: true },
    });
    const branchStaffIds = branchStaff.map((s) => s.user_id);

    // Фильтры
    const where = {
      admin_id: { in: branchStaffIds },
    };

    if (staffId) {
      where.admin_id = Number(staffId);
    }
    if (dateFrom || dateTo) {
      where.created_at = {};
      if (dateFrom) where.created_at.gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        where.created_at.lte = end;
      }
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [logs, total] = await Promise.all([
      prisma.admin_log.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: Number(limit),
        include: {
          user_admin_log_admin_idTouser: {
            select: {
              user_id: true,
              phone: true,
              user_info: { select: { name: true, surname: true } },
            },
          },
          user_admin_log_target_user_idTouser: {
            select: {
              user_id: true,
              phone: true,
              user_info: { select: { name: true, surname: true } },
            },
          },
          work_shift: {
            select: { shift_id: true, opened_at: true },
          },
        },
      }),
      prisma.admin_log.count({ where }),
    ]);

    const result = logs.map((log) => ({
      log_id: log.log_id,
      action_type: log.action_type,
      action_name: ACTION_TYPES[log.action_type] || `Действие #${log.action_type}`,
      created_at: log.created_at,
      shift_id: log.shift_id,
      admin: {
        id: log.user_admin_log_admin_idTouser.user_id,
        name: log.user_admin_log_admin_idTouser.user_info?.name ?? '—',
        surname: log.user_admin_log_admin_idTouser.user_info?.surname ?? '',
        phone: log.user_admin_log_admin_idTouser.phone,
      },
      target: log.user_admin_log_target_user_idTouser
        ? {
            id: log.user_admin_log_target_user_idTouser.user_id,
            name: log.user_admin_log_target_user_idTouser.user_info?.name ?? '—',
            surname: log.user_admin_log_target_user_idTouser.user_info?.surname ?? '',
            phone: log.user_admin_log_target_user_idTouser.phone,
          }
        : null,
    }));

    return res.status(200).json({
      logs: result,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    console.error('Ошибка получения логов:', err);
    return res.status(500).json({ message: 'Не удалось загрузить логи', error: err.message });
  }
};

// Список сотрудников филиала — для фильтра по имени
const getBranchStaff = async (req, res) => {
  try {
    const { userId } = req.user;
    const staffRecord = await prisma.staff.findUnique({ where: { user_id: userId } });
    if (!staffRecord) return res.status(403).json({ message: 'Сотрудник не найден' });

    const staff = await prisma.staff.findMany({
      where: { branch_id: staffRecord.branch_id },
      include: {
        user: {
          select: {
            user_id: true,
            phone: true,
            user_info: { select: { name: true, surname: true } },
            permission: { select: { role: { select: { name_role: true } } } },
          },
        },
      },
    });

    return res.status(200).json(
      staff.map((s) => ({
        user_id: s.user.user_id,
        name: s.user.user_info?.name ?? '—',
        surname: s.user.user_info?.surname ?? '',
        phone: s.user.phone,
        role: s.user.permission[0]?.role?.name_role ?? '—',
      })),
    );
  } catch (err) {
    return res.status(500).json({ message: 'Ошибка получения сотрудников' });
  }
};

export default { getBranchLogs, getBranchStaff };
