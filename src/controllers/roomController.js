import { error } from 'node:console';
import prisma from '../config/db.js';

import { startOfDay, endOfDay, addDays, format, isAfter } from 'date-fns';

const getActiveRooms = async (req, res) => {
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

    filters.is_deleted = false;
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

const getRoom = async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await prisma.room.findUnique({
      where: {
        // 2. ОБЯЗАТЕЛЬНО переводим в число
        room_id: Number(roomId),
      },
      // Не забудь добавить include, иначе на фронте пропадет категория и адрес!
      include: {
        category: { select: { name: true } },
        branch_office: { select: { address: true } },
      },
    });

    const roomData = {
      ...room,
      category_name: room.category.name,
      address: room.branch_office.address,
    };
    delete roomData.category;
    delete roomData.branch_office;

    return res.status(200).json(roomData);
  } catch (err) {
    console.error('Ошибка при получении данных о комнате:', err);
    return res.status(500).json({
      message: 'Не удалось загрузить данные о комнаты',
      error: err.message,
    });
  }
};

const getSlots = async (req, res) => {
  try {
    const { roomId } = req.params;

    // 1. Получаем инфо о комнате и ВСЕХ ремонтах на ближайшие 14 дней
    const startDate = startOfDay(new Date());
    const endDate = endOfDay(addDays(startDate, 14));

    const room = await prisma.room.findUnique({
      where: { room_id: Number(roomId) },
      include: {
        room_maintenance: {
          where: {
            start_at: { lte: endDate },
            end_at: { gte: startDate },
          },
        },
      },
    });

    if (!room || room.is_deleted) {
      return res.status(404).json({ message: 'Комната не найдена' });
    }

    // 2. Получаем все бронирования на 2 недели вперед за один запрос (для оптимизации)
    const bookings = await prisma.booking.findMany({
      where: {
        room_id: Number(roomId),
        booking_date: {
          gte: startDate,
          lte: endDate,
        },
        status_booking: {
          is: {
            name: { in: ['Оплачено', 'Ожидает оплаты (наличные)', 'Ожидает оплаты (онлайн)'] },
          },
        },
      },
    });

    const schedule = [];
    const now = new Date();

    // 3. ЦИКЛ ПО ДНЯМ (от 0 до 13)
    for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
      const currentDay = addDays(startDate, dayOffset);
      const dayKey = format(currentDay, 'yyyy-MM-dd');
      const dailySlots = [];

      // Фильтруем брони для текущего дня
      const bookingsForDay = bookings.filter((b) => {
        const d = new Date(b.booking_date);
        const bookingDayKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        return bookingDayKey === dayKey;
      });

      bookingsForDay.forEach((b) => {
        console.log('Бронь:', {
          booking_date: b.booking_date,
          time_begin: b.time_begin,
          time_end: b.time_end,
        });
      });

      // 4. ЦИКЛ ПО ЧАСАМ
      for (let hour = 10; hour <= 22; hour++) {
        const timeString = `${hour.toString().padStart(2, '0')}:00`;
        const slotDateTime = new Date(currentDay);
        slotDateTime.setHours(hour, 0, 0, 0);
        const slotEnd = new Date(slotDateTime);
        slotEnd.setHours(hour + 1); // конец слота — следующий час

        const isUnderMaintenance = room.room_maintenance.some(
          (m) => slotDateTime >= new Date(m.start_at) && slotDateTime < new Date(m.end_at),
        );

        // ✅ Проверяем пересечение слота [hour, hour+1) с бронью [time_begin, time_end)
        const isBooked = bookingsForDay.some((b) => {
          const bookingStartHour = new Date(b.time_begin).getUTCHours();
          const bookingEndHour = new Date(b.time_end).getUTCHours();
          return hour < bookingEndHour && hour + 1 > bookingStartHour;
          // 👇 ДОБАВЬ ЭТО
          console.log(`Слот ${timeString}:`, {
            slotDateTime: slotDateTime.toISOString(),
            slotEnd: slotEnd.toISOString(),
            bookingStart: bookingStart.toISOString(),
            bookingEnd: bookingEnd.toISOString(),
            пересечение: slotDateTime < bookingEnd && slotEnd > bookingStart,
          });
        });
        const isPast = isAfter(now, slotDateTime);

        dailySlots.push({
          time: timeString,
          isAvailable: !isUnderMaintenance && !isBooked && !isPast,
          reason: isUnderMaintenance
            ? 'Maintenance'
            : isBooked
              ? 'Occupied'
              : isPast
                ? 'Past'
                : null,
        });
      }

      schedule.push({
        date: dayKey,
        slots: dailySlots,
      });
    }

    res.json(schedule);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};

const getBranchRooms = async (req, res) => {
  try {
    const staffRecord = await prisma.staff.findUnique({
      where: { user_id: req.user.userId },
    });
    if (!staffRecord) return res.status(403).json({ message: 'Сотрудник не найден' });

    const rooms = await prisma.room.findMany({
      where: { branch_id: staffRecord.branch_id, is_deleted: false },
      include: { category: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });

    return res
      .status(200)
      .json(rooms.map(({ category, ...r }) => ({ ...r, category_name: category.name })));
  } catch (err) {
    return res.status(500).json({ message: 'Ошибка получения комнат', error: err.message });
  }
};

export default {
  getActiveRooms,
  getRoom,
  getSlots,
  getBranchRooms,
};
