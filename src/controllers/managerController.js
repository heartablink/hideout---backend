import prisma from '../config/db.js';

const getAnalytics = async (req, res) => {
  try {
    const { userId } = req.user;

    // Определяем филиал управляющего
    const staff = await prisma.staff.findUnique({
      where: { user_id: userId },
    });

    if (!staff) {
      return res.status(403).json({ message: 'Филиал не найден' });
    }

    const branchId = staff.branch_id;

    // Период: последние 30 дней
    const now = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const todayStr = now.toISOString().slice(0, 10);

    const { period = '30d' } = req.query;

    const periodDays = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const dateFrom = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

    // ── Все завершённые брони филиала за период ──
    const bookings = await prisma.booking.findMany({
      where: {
        room: { branch_id: branchId },
        status_id: 3, // Завершено
        booking_date: { gte: dateFrom },
      },
      include: {
        room: { select: { name: true, category_id: true, category: { select: { name: true } } } },
      },
      orderBy: { booking_date: 'asc' },
    });

    // ── Выручка и посетители по дням ──
    const byDay = {};
    for (const b of bookings) {
      const day = new Date(b.booking_date).toISOString().slice(0, 10);
      if (!byDay[day]) byDay[day] = { date: day, revenue: 0, visitors: 0, hours: 0 };
      byDay[day].revenue += Number(b.paid_sum ?? b.total_cost);
      byDay[day].visitors += 1;
      const duration = (new Date(b.time_end) - new Date(b.time_begin)) / (1000 * 60 * 60);
      byDay[day].hours += duration > 0 ? duration : 0;
    }

    // Заполняем пустые дни нулями чтобы график был непрерывным
    const dailyStats = [];
    for (let i = 0; i < periodDays; i++) {
      const d = new Date(dateFrom.getTime() + i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      dailyStats.push(byDay[key] ?? { date: key, revenue: 0, visitors: 0, hours: 0 });
    }

    // ── Выручка по комнатам ──
    const byRoom = {};
    for (const b of bookings) {
      const key = b.room.name;
      if (!byRoom[key]) byRoom[key] = { name: key, revenue: 0, bookings: 0 };
      byRoom[key].revenue += Number(b.paid_sum ?? b.total_cost);
      byRoom[key].bookings += 1;
    }
    const roomStats = Object.values(byRoom).sort((a, b) => b.revenue - a.revenue);

    // ── Выручка по категориям ──
    const byCategory = {};
    for (const b of bookings) {
      const key = b.room.category.name;
      if (!byCategory[key]) byCategory[key] = { name: key, revenue: 0, bookings: 0 };
      byCategory[key].revenue += Number(b.paid_sum ?? b.total_cost);
      byCategory[key].bookings += 1;
    }
    const categoryStats = Object.values(byCategory);

    // ── Распределение по часам (тепловая карта загрузки) ──
    const byHour = Array.from({ length: 14 }, (_, i) => ({
      hour: `${(i + 10).toString().padStart(2, '0')}:00`,
      bookings: 0,
    }));
    for (const b of bookings) {
      const hour = new Date(b.time_begin).getUTCHours();
      const idx = hour - 10;
      if (idx >= 0 && idx < 14) byHour[idx].bookings += 1;
    }

    // ── Итоговые KPI ──
    const totalRevenue = bookings.reduce((s, b) => s + Number(b.paid_sum ?? b.total_cost), 0);
    const totalVisitors = bookings.length;
    const totalHours = bookings.reduce((s, b) => {
      const h = (new Date(b.time_end) - new Date(b.time_begin)) / (1000 * 60 * 60);
      return s + (h > 0 ? h : 0);
    }, 0);
    const avgCheck = totalVisitors > 0 ? totalRevenue / totalVisitors : 0;

    // Активные комнаты филиала для расчёта загрузки
    const rooms = await prisma.room.findMany({
      where: { branch_id: branchId, is_deleted: false },
    });
    // Рабочих часов за период: комнаты × дни × 14 часов (10:00–23:00)
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

export default { getAnalytics };
