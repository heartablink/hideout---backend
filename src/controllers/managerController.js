import prisma from '../config/db.js';

const getAnalytics = async (req, res) => {
  try {
    const { userId } = req.user;

    const staff = await prisma.staff.findUnique({
      where: { user_id: userId },
    });

    if (!staff) {
      return res.status(403).json({ message: 'Филиал не найден' });
    }

    const branchId = staff.branch_id;

    const now = new Date(Date.now() + 3 * 60 * 60 * 1000);

    const { period = '30d' } = req.query;
    const periodDays = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const dateFrom = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

    // ── Все брони филиала за период (включая завершённые, оплаченные и активные)
    const bookings = await prisma.booking.findMany({
      where: {
        room: { branch_id: branchId },
        // БАГ БЫЛ ЗДЕСЬ: фильтровали только status_id: 3, теперь берём всё
        booking_date: { gte: dateFrom },
      },
      include: {
        room: {
          select: { name: true, category_id: true, category: { select: { name: true } } },
        },
      },
      orderBy: { booking_date: 'asc' },
    });

    // ── Выручка и посетители по дням
    // БАГ БЫЛ ЗДЕСЬ: paid_sum часто 0/null, используем total_cost для оплаченных броней
    const byDay = {};
    for (const b of bookings) {
      // Только оплаченные или завершённые для выручки
      const isPaidBooking = b.is_paid || b.status_id === 3 || b.status_id === 7;
      const revenue = isPaidBooking
        ? Number(b.paid_sum && Number(b.paid_sum) > 0 ? b.paid_sum : b.total_cost)
        : 0;

      const d = new Date(b.booking_date);
      const day = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

      if (!byDay[day]) byDay[day] = { date: day, revenue: 0, visitors: 0, hours: 0 };
      byDay[day].revenue += revenue;
      byDay[day].visitors += 1;
      const duration = (new Date(b.time_end) - new Date(b.time_begin)) / (1000 * 60 * 60);
      byDay[day].hours += duration > 0 ? duration : 0;
    }

    const dailyStats = [];
    for (let i = 0; i < periodDays; i++) {
      const d = new Date(dateFrom.getTime() + i * 24 * 60 * 60 * 1000);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      dailyStats.push(byDay[key] ?? { date: key, revenue: 0, visitors: 0, hours: 0 });
    }

    // ── Выручка по комнатам (только оплаченные)
    const byRoom = {};
    for (const b of bookings) {
      if (!b.is_paid && b.status_id !== 3) continue;
      const key = b.room.name;
      if (!byRoom[key]) byRoom[key] = { name: key, revenue: 0, bookings: 0 };
      const rev = Number(b.paid_sum && Number(b.paid_sum) > 0 ? b.paid_sum : b.total_cost);
      byRoom[key].revenue += rev;
      byRoom[key].bookings += 1;
    }
    const roomStats = Object.values(byRoom).sort((a, b) => b.revenue - a.revenue);

    // ── Выручка по категориям
    const byCategory = {};
    for (const b of bookings) {
      if (!b.is_paid && b.status_id !== 3) continue;
      const key = b.room.category.name;
      if (!byCategory[key]) byCategory[key] = { name: key, revenue: 0, bookings: 0 };
      const rev = Number(b.paid_sum && Number(b.paid_sum) > 0 ? b.paid_sum : b.total_cost);
      byCategory[key].revenue += rev;
      byCategory[key].bookings += 1;
    }
    const categoryStats = Object.values(byCategory);

    // ── Распределение по часам
    const byHour = Array.from({ length: 14 }, (_, i) => ({
      hour: `${(i + 10).toString().padStart(2, '0')}:00`,
      bookings: 0,
    }));
    for (const b of bookings) {
      const hour = new Date(b.time_begin).getUTCHours();
      const idx = hour - 10;
      if (idx >= 0 && idx < 14) byHour[idx].bookings += 1;
    }

    // ── KPI: только is_paid брони для финансов
    const paidBookings = bookings.filter((b) => b.is_paid || b.status_id === 3);
    const totalRevenue = paidBookings.reduce((s, b) => {
      return s + Number(b.paid_sum && Number(b.paid_sum) > 0 ? b.paid_sum : b.total_cost);
    }, 0);
    const totalVisitors = bookings.length;
    const totalHours = bookings.reduce((s, b) => {
      const h = (new Date(b.time_end) - new Date(b.time_begin)) / (1000 * 60 * 60);
      return s + (h > 0 ? h : 0);
    }, 0);
    const avgCheck = paidBookings.length > 0 ? totalRevenue / paidBookings.length : 0;

    const rooms = await prisma.room.findMany({
      where: { branch_id: branchId, is_deleted: false },
    });
    const maxHours = rooms.length * periodDays * 14;
    const occupancyRate = maxHours > 0 ? (totalHours / maxHours) * 100 : 0;

    return res.json({
      period,
      kpi: {
        totalRevenue: Math.round(totalRevenue),
        totalVisitors,
        avgCheck: Math.round(avgCheck),
        occupancyRate: Math.round(occupancyRate * 10) / 10,
      },
      dailyStats,
      roomStats,
      categoryStats,
      hourStats: byHour,
    });
  } catch (err) {
    console.error('Ошибка аналитики:', err);
    return res.status(500).json({ message: 'Не удалось загрузить аналитику' });
  }
};

const getBookingsHistory = async (req, res) => {
  try {
    const { userId } = req.user;

    const staff = await prisma.staff.findUnique({ where: { user_id: userId } });
    if (!staff) return res.status(403).json({ message: 'Филиал не найден' });

    const branchId = staff.branch_id;

    const { period = 'month', search = '', status = '', page = 1, limit = 20 } = req.query;

    const now = new Date(Date.now() + 3 * 60 * 60 * 1000);
    let dateFrom;
    if (period === 'week') dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    else if (period === 'month') dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    else if (period === '3months') dateFrom = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    else if (period === 'year') dateFrom = new Date(now.getFullYear(), 0, 1);
    else dateFrom = new Date(0);

    const skip = (Number(page) - 1) * Number(limit);

    const where = {
      room: { branch_id: branchId },
      booking_date: { gte: dateFrom },
    };

    if (status) where.status_id = Number(status);

    if (search.trim()) {
      where.user = {
        OR: [
          { phone: { contains: search.trim() } },
          { user_info: { name: { contains: search.trim(), mode: 'insensitive' } } },
          { user_info: { surname: { contains: search.trim(), mode: 'insensitive' } } },
        ],
      };
    }

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: [{ booking_date: 'desc' }, { time_begin: 'desc' }],
        include: {
          room: { select: { name: true } },
          user: { select: { phone: true, user_info: { select: { name: true, surname: true } } } },
          status_booking: { select: { name: true } },
        },
      }),
      prisma.booking.count({ where }),
    ]);

    const totalRevenue = await prisma.booking.aggregate({
      where: { ...where, status_id: 3 },
      _sum: { paid_sum: true },
    });

    return res.json({
      bookings: bookings.map((b) => ({
        id: b.booking_id,
        date: b.booking_date,
        timeBegin: b.time_begin.toISOString().slice(11, 16),
        timeEnd: b.time_end.toISOString().slice(11, 16),
        roomName: b.room?.name || '—',
        clientName:
          `${b.user?.user_info?.name || ''} ${b.user?.user_info?.surname || ''}`.trim() || '—',
        clientPhone: b.user?.phone || '—',
        totalCost: Number(b.total_cost),
        paidSum: Number(b.paid_sum || 0),
        isPaid: b.is_paid,
        status: b.status_booking?.name || '—',
        statusId: b.status_id,
      })),
      total,
      totalPages: Math.ceil(total / Number(limit)),
      totalRevenue: Number(totalRevenue._sum.paid_sum || 0),
    });
  } catch (err) {
    console.error('Ошибка истории бронирований:', err);
    return res.status(500).json({ message: 'Не удалось загрузить историю' });
  }
};

export default { getAnalytics, getBookingsHistory };
