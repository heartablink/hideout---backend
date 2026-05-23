import Router from 'express';
import loyaltyController from '../controllers/loyaltyController.js';

const router = new Router();

// Старый эндпоинт (оставляем для совместимости)
router.get('/levelLoyalty/:level', loyaltyController.getLevel);

// Новые эндпоинты
router.get('/loyalty/levels', loyaltyController.getAllLevels);
router.get('/loyalty/activities', loyaltyController.getAllActivities);
router.get('/loyalty/packages', loyaltyController.getAllPackages);
router.get('/loyalty/info', loyaltyController.getLoyaltyInfo);

export default router;
