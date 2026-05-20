import { Router } from 'express';
import checkAuth from '../middleware/checkAuth.js';
import checkRole from '../middleware/checkRole.js';
import packageController from '../controllers/packageController.js';

const router = new Router();

// Поиск клиента по телефону
router.get(
  '/packages/search-client',
  checkAuth,
  checkRole('Администратор', 'Менеджер'),
  packageController.searchClient,
);

// Список активных пакетов
router.get(
  '/packages',
  checkAuth,
  checkRole('Администратор', 'Менеджер'),
  packageController.getPackages,
);

// Подтверждение покупки
router.post(
  '/packages/purchase',
  checkAuth,
  checkRole('Администратор', 'Менеджер'),
  packageController.purchasePackage,
);

export default router;
