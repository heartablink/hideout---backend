import Router from 'express';
import checkAuth from '../middleware/checkAuth.js';
import checkRole from '../middleware/checkRole.js';
import staffController from '../controllers/staffController.js';

const router = new Router();

const onlyStaff = checkRole('Администратор', 'Управляющий');

router.get('/staff/me', checkAuth, onlyStaff, staffController.getStaffMe);
router.get('/staff/shifts', checkAuth, onlyStaff, staffController.getStaffShifts);
router.get('/staff/logs', checkAuth, onlyStaff, staffController.getStaffLogs);
router.post('/staff/shift/open', checkAuth, onlyStaff, staffController.openShift);
router.post('/staff/shift/close', checkAuth, onlyStaff, staffController.closeShift);

export default router;
