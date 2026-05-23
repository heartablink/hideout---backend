import prisma from '../config/db.js';
import fs from 'fs';
import path from 'path';

// ─── Получить все комнаты филиала управляющего ─────────────────────────────
const getManagerRooms = async (req, res) => {
  try {
    const { userId } = req.user;

    // Определяем филиал управляющего через таблицу staff
    const staffRecord = await prisma.staff.findUnique({
      where: { user_id: userId },
    });

    if (!staffRecord) {
      return res.status(403).json({ message: 'Вы не привязаны ни к одному филиалу' });
    }

    const rooms = await prisma.room.findMany({
      where: {
        branch_id: staffRecord.branch_id,
        is_deleted: false,
      },
      include: {
        category: { select: { name: true } },
        branch_office: { select: { address: true } },
        // Активные ремонты — берём только те, что сейчас идут
        room_maintenance: {
          where: {
            start_at: { lte: new Date() },
            end_at: { gte: new Date() },
          },
          orderBy: { start_at: 'desc' },
          take: 1,
        },
      },
      orderBy: { room_id: 'asc' },
    });

    const result = rooms.map(({ category, branch_office, room_maintenance, ...room }) => ({
      ...room,
      price: Number(room.price),
      category_name: category.name,
      address: branch_office.address,
      // Если есть активный ремонт — комната считается закрытой
      is_active: room_maintenance.length === 0,
      maintenance_reason: room_maintenance[0]?.reason ?? null,
      maintenance_end: room_maintenance[0]?.end_at ?? null,
    }));

    return res.status(200).json(result);
  } catch (err) {
    console.error('Ошибка getManagerRooms:', err);
    return res.status(500).json({ message: 'Не удалось загрузить комнаты' });
  }
};

// ─── Создать новую комнату ──────────────────────────────────────────────────
const createRoom = async (req, res) => {
  try {
    const { userId } = req.user;
    const { name, category_id, max_people, price, description } = req.body;

    const staffRecord = await prisma.staff.findUnique({ where: { user_id: userId } });
    if (!staffRecord) {
      // Если файл уже загрузился — чистим его
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(403).json({ message: 'Вы не привязаны ни к одному филиалу' });
    }

    // Валидация обязательных полей
    if (!name?.trim()) return res.status(400).json({ message: 'Укажите название комнаты' });
    if (!category_id) return res.status(400).json({ message: 'Укажите категорию' });
    if (!max_people || Number(max_people) <= 0)
      return res.status(400).json({ message: 'Укажите корректное количество человек' });
    if (!price || Number(price) <= 0)
      return res.status(400).json({ message: 'Укажите корректную цену' });

    // Путь к изображению (если загружено)
    const imageUrl = req.file ? `http://localhost:4444/uploads/rooms/${req.file.filename}` : null;

    const room = await prisma.$transaction(async (tx) => {
      // Получаем максимальный room_id для генерации нового (т.к. в схеме нет autoincrement)
      const maxRoom = await tx.room.findFirst({ orderBy: { room_id: 'desc' } });
      const nextId = (maxRoom?.room_id ?? 0) + 1;

      const newRoom = await tx.room.create({
        data: {
          room_id: nextId,
          name: name.trim(),
          category_id: Number(category_id),
          branch_id: staffRecord.branch_id,
          max_people: Number(max_people),
          price: Number(price),
          description: description?.trim() ?? null,
          image: imageUrl,
          is_deleted: false,
        },
      });

      // Записываем начальную цену в историю
      await tx.price_history.create({
        data: {
          room_id: newRoom.room_id,
          price: Number(price),
          admin_id: userId,
        },
      });

      return newRoom;
    });

    return res.status(201).json({ ...room, price: Number(room.price) });
  } catch (err) {
    if (req.file) fs.unlinkSync(req.file.path);
    console.error('Ошибка createRoom:', err);
    return res.status(500).json({ message: 'Не удалось создать комнату' });
  }
};

// ─── Редактировать комнату (название, описание, вместимость, фото) ──────────
const updateRoom = async (req, res) => {
  try {
    const { userId } = req.user;
    const { roomId } = req.params;
    const { name, max_people, description } = req.body;

    // Проверяем, что комната принадлежит филиалу этого управляющего
    const staffRecord = await prisma.staff.findUnique({ where: { user_id: userId } });
    const room = await prisma.room.findFirst({
      where: { room_id: Number(roomId), is_deleted: false },
    });

    if (!room) return res.status(404).json({ message: 'Комната не найдена' });
    if (room.branch_id !== staffRecord?.branch_id) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(403).json({ message: 'Нет доступа к этой комнате' });
    }

    const updateData = {};
    if (name?.trim()) updateData.name = name.trim();
    if (max_people && Number(max_people) > 0) updateData.max_people = Number(max_people);
    if (description !== undefined) updateData.description = description?.trim() ?? null;

    // Если загружено новое фото — удаляем старое
    if (req.file) {
      if (room.image) {
        const oldFilename = path.basename(room.image);
        const oldPath = path.join('uploads', 'rooms', oldFilename);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      updateData.image = `http://localhost:4444/uploads/rooms/${req.file.filename}`;
    }

    const updated = await prisma.room.update({
      where: { room_id: Number(roomId) },
      data: updateData,
    });

    return res.status(200).json({ ...updated, price: Number(updated.price) });
  } catch (err) {
    if (req.file) fs.unlinkSync(req.file.path);
    console.error('Ошибка updateRoom:', err);
    return res.status(500).json({ message: 'Не удалось обновить комнату' });
  }
};

// ─── Изменить цену комнаты ──────────────────────────────────────────────────
const updateRoomPrice = async (req, res) => {
  try {
    const { userId } = req.user;
    const { roomId } = req.params;
    const { price } = req.body;

    if (!price || Number(price) <= 0) {
      return res.status(400).json({ message: 'Цена должна быть больше нуля' });
    }

    const staffRecord = await prisma.staff.findUnique({ where: { user_id: userId } });
    const room = await prisma.room.findFirst({
      where: { room_id: Number(roomId), is_deleted: false },
    });

    if (!room) return res.status(404).json({ message: 'Комната не найдена' });
    if (room.branch_id !== staffRecord?.branch_id) {
      return res.status(403).json({ message: 'Нет доступа к этой комнате' });
    }

    const newPrice = Number(price);
    if (newPrice === Number(room.price)) {
      return res.status(400).json({ message: 'Новая цена должна отличаться от текущей' });
    }

    const [updatedRoom] = await prisma.$transaction([
      prisma.room.update({
        where: { room_id: Number(roomId) },
        data: { price: newPrice },
      }),
      prisma.price_history.create({
        data: {
          room_id: Number(roomId),
          price: newPrice,
          admin_id: userId,
        },
      }),
    ]);

    return res.status(200).json({ ...updatedRoom, price: Number(updatedRoom.price) });
  } catch (err) {
    console.error('Ошибка updateRoomPrice:', err);
    return res.status(500).json({ message: 'Не удалось обновить цену' });
  }
};

// ─── Мягкое удаление комнаты ────────────────────────────────────────────────
const deleteRoom = async (req, res) => {
  try {
    const { userId } = req.user;
    const { roomId } = req.params;

    const staffRecord = await prisma.staff.findUnique({ where: { user_id: userId } });
    const room = await prisma.room.findFirst({
      where: { room_id: Number(roomId), is_deleted: false },
    });

    if (!room) return res.status(404).json({ message: 'Комната не найдена' });
    if (room.branch_id !== staffRecord?.branch_id) {
      return res.status(403).json({ message: 'Нет доступа к этой комнате' });
    }

    await prisma.room.update({
      where: { room_id: Number(roomId) },
      data: { is_deleted: true },
    });

    return res.status(200).json({ message: 'Комната удалена' });
  } catch (err) {
    console.error('Ошибка deleteRoom:', err);
    return res.status(500).json({ message: 'Не удалось удалить комнату' });
  }
};

// ─── Закрыть комнату на обслуживание ────────────────────────────────────────
const closeRoomForMaintenance = async (req, res) => {
  try {
    const { userId } = req.user;
    const { roomId } = req.params;
    const { reason, start_at, end_at } = req.body;

    if (!reason?.trim()) {
      return res.status(400).json({ message: 'Укажите причину закрытия' });
    }

    const startDate = start_at ? new Date(start_at) : new Date();
    const endDate = end_at ? new Date(end_at) : null;

    if (endDate && endDate <= startDate) {
      return res
        .status(400)
        .json({ message: 'Дата окончания не может быть раньше или равна дате начала' });
    }

    const staffRecord = await prisma.staff.findUnique({ where: { user_id: userId } });
    const room = await prisma.room.findFirst({
      where: { room_id: Number(roomId), is_deleted: false },
    });

    if (!room) return res.status(404).json({ message: 'Комната не найдена' });
    if (room.branch_id !== staffRecord?.branch_id) {
      return res.status(403).json({ message: 'Нет доступа к этой комнате' });
    }

    // Проверка: нет ли уже активного ремонта на этот период
    const overlapping = await prisma.room_maintenance.findFirst({
      where: {
        room_id: Number(roomId),
        start_at: { lte: endDate ?? new Date('2099-12-31') },
        end_at: { gte: startDate },
      },
    });

    if (overlapping) {
      return res.status(409).json({
        message: `На выбранный период уже существует запись о техобслуживании (с ${overlapping.start_at.toLocaleDateString('ru')} по ${overlapping.end_at.toLocaleDateString('ru')})`,
      });
    }

    // Проверяем активные бронирования, которые пересекаются с периодом ремонта.
    // Бронь пересекается если: booking_date >= startDate.date И time_end > startDate.time
    // и (нет endDate ИЛИ booking_date <= endDate.date И time_begin < endDate.time)
    //
    // Упрощённо через booking_date + time_begin/time_end в UTC:
    // бронь [time_begin, time_end) пересекается с [startDate, endDate) если
    // time_begin < endDate AND time_end > startDate
    const effectiveEnd = endDate ?? new Date('2099-12-31T23:59:59Z');

    const conflictBookings = await prisma.booking.findMany({
      where: {
        room_id: Number(roomId),
        status_booking: {
          name: { in: ['Оплачено', 'Ожидает оплаты (наличные)', 'Ожидает оплаты (онлайн)'] },
        },
        // Бронь начинается до конца ремонта
        time_begin: { lt: effectiveEnd },
        // И заканчивается после начала ремонта — но time_end хранит только время,
        // поэтому дополнительно фильтруем по booking_date
        booking_date: {
          // Дата брони должна быть в диапазоне [startDate, effectiveEnd]
          gte: new Date(startDate.toISOString().slice(0, 10)), // только дата
          lte: new Date(effectiveEnd.toISOString().slice(0, 10)),
        },
      },
      select: {
        booking_id: true,
        booking_date: true,
        time_begin: true,
        time_end: true,
      },
    });

    // Точная проверка пересечения с учётом времени:
    // собираем дату+время начала и окончания каждой брони в UTC и сравниваем с периодом ремонта
    const realConflicts = conflictBookings.filter((b) => {
      const dateStr = new Date(b.booking_date).toISOString().slice(0, 10);
      const bStart = new Date(`${dateStr}T${new Date(b.time_begin).toISOString().slice(11, 19)}Z`);
      const bEnd = new Date(`${dateStr}T${new Date(b.time_end).toISOString().slice(11, 19)}Z`);
      // Пересечение: bStart < effectiveEnd AND bEnd > startDate
      return bStart < effectiveEnd && bEnd > startDate;
    });

    if (realConflicts.length > 0) {
      // Возвращаем дату последнего конфликтного бронирования для подсказки управляющему
      const lastConflict = realConflicts.reduce((a, b) =>
        new Date(a.booking_date) > new Date(b.booking_date) ? a : b,
      );
      const lastDate = new Date(lastConflict.booking_date).toLocaleDateString('ru');
      return res.status(409).json({
        message: `На период закрытия есть ${realConflicts.length} активных бронирований (последнее — ${lastDate}). Сначала отмените их или выберите другие даты.`,
        conflictCount: realConflicts.length,
        lastBookingDate: lastDate,
      });
    }

    const maintenance = await prisma.room_maintenance.create({
      data: {
        room_id: Number(roomId),
        reason: reason.trim(),
        start_at: startDate,
        end_at: endDate ?? new Date('2099-12-31'), // бессрочное закрытие
        created_by: userId,
      },
    });

    return res.status(201).json(maintenance);
  } catch (err) {
    console.error('Ошибка closeRoomForMaintenance:', err);
    return res.status(500).json({ message: 'Не удалось закрыть комнату' });
  }
};

// ─── Открыть комнату (завершить обслуживание) ───────────────────────────────
const reopenRoom = async (req, res) => {
  try {
    const { userId } = req.user;
    const { roomId } = req.params;

    const staffRecord = await prisma.staff.findUnique({ where: { user_id: userId } });
    const room = await prisma.room.findFirst({
      where: { room_id: Number(roomId), is_deleted: false },
    });

    if (!room) return res.status(404).json({ message: 'Комната не найдена' });
    if (room.branch_id !== staffRecord?.branch_id) {
      return res.status(403).json({ message: 'Нет доступа к этой комнате' });
    }

    // Закрываем все активные записи о ремонте: устанавливаем end_at = сейчас
    const now = new Date();
    await prisma.room_maintenance.updateMany({
      where: {
        room_id: Number(roomId),
        start_at: { lte: now },
        end_at: { gte: now },
      },
      data: { end_at: now },
    });

    return res.status(200).json({ message: 'Комната открыта' });
  } catch (err) {
    console.error('Ошибка reopenRoom:', err);
    return res.status(500).json({ message: 'Не удалось открыть комнату' });
  }
};

export default {
  getManagerRooms,
  createRoom,
  updateRoom,
  updateRoomPrice,
  deleteRoom,
  closeRoomForMaintenance,
  reopenRoom,
};
