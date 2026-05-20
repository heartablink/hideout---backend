import { Router } from 'express';
import checkAuth from '../middleware/checkAuth.js';
import checkRole from '../middleware/checkRole.js';
import managerController from '../controllers/managerController.js';

const router = new Router();

router.get(
  '/manager/analytics',
  checkAuth,
  checkRole('Управляющий'),
  managerController.getAnalytics,
);

export default router;
