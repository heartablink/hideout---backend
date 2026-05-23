import Router from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

import checkAuth from '../middleware/checkAuth.js';
import checkRole from '../middleware/checkRole.js';
import roomManagementController from '../controllers/roomManagementController.js';
import checkActiveShift from '../middleware/checkActiveShift.js';

// ─── Настройка multer ───────────────────────────────────────────────────────
const uploadDir = 'uploads/rooms';

// Создаём папку автоматически, если её нет
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `room_${Date.now()}_${Math.round(Math.random() * 1e6)}${ext}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (_req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Допустимы только файлы: JPG, PNG, WEBP'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

// ─── Роуты (все защищены — только Менеджер) ────────────────────────────────
const router = new Router();
const managerOnly = [checkAuth, checkRole('Управляющий')];

// Получить все комнаты своего филиала
router.get('/manager/rooms', ...managerOnly, roomManagementController.getManagerRooms);

// Создать новую комнату (с опциональной загрузкой фото)
router.post(
  '/manager/rooms',
  ...managerOnly,
  checkActiveShift,
  upload.single('image'),
  roomManagementController.createRoom,
);

// Редактировать комнату (название, описание, вместимость, фото)
router.put(
  '/manager/rooms/:roomId',
  ...managerOnly,
  checkActiveShift,
  upload.single('image'),
  roomManagementController.updateRoom,
);

// Изменить цену
router.patch(
  '/manager/rooms/:roomId/price',
  ...managerOnly,
  checkActiveShift,
  roomManagementController.updateRoomPrice,
);

// Мягкое удаление
router.delete(
  '/manager/rooms/:roomId',
  ...managerOnly,
  checkActiveShift,
  roomManagementController.deleteRoom,
);

// Закрыть на обслуживание
router.post(
  '/manager/rooms/:roomId/maintenance',
  ...managerOnly,
  checkActiveShift,
  roomManagementController.closeRoomForMaintenance,
);

// Открыть (завершить обслуживание)
router.delete(
  '/manager/rooms/:roomId/maintenance',
  ...managerOnly,
  checkActiveShift,
  roomManagementController.reopenRoom,
);

export default router;
