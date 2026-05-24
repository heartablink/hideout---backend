import Router from 'express';
import adminLogController from '../controllers/adminLogController.js';
import checkAuth from '../middleware/checkAuth.js';
import checkRole from '../middleware/checkRole.js';

const router = new Router();

router.get('/manager/logs', checkAuth, checkRole('Управляющий'), adminLogController.getBranchLogs);
router.get(
  '/manager/staff',
  checkAuth,
  checkRole('Управляющий'),
  adminLogController.getBranchStaff,
);

export default router;
