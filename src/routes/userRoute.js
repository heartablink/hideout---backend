import Router from 'express';

import checkAuth from '../middleware/checkAuth.js';
import userController from '../controllers/userController.js';

const router = new Router();

router.get('/me', checkAuth, userController.getMe);
router.patch('/me', checkAuth, userController.updateMe);
router.delete('/me', checkAuth, userController.deleteMe);

router.get('/me/xp-logs', checkAuth, userController.getXpLogs);

router.get('/me/transactions', checkAuth, userController.getTransactions);

export default router;
