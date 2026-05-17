import { Router } from 'express';
import checkAuth from '../middleware/checkAuth.js';
import checkRole from '../middleware/checkRole.js';

import shiftController from '../controllers/shiftController.js';

const router = new Router();

router.post(
  '/shift/open',
  checkAuth,
  checkRole('Администратор', 'Менеджер'),
  shiftController.openShift,
);
router.post(
  '/shift/close',
  checkAuth,
  checkRole('Администратор', 'Менеджер'),
  shiftController.closeShift,
);
router.get(
  '/shift/status',
  checkAuth,
  checkRole('Администратор', 'Менеджер'),
  shiftController.getShiftStatus,
);

export default router;
