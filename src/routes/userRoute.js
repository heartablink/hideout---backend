import Router from 'express';

import checkAuth from '../middleware/checkAuth.js';
import userController from '../controllers/userController.js';

const router = new Router();

router.get('/me', checkAuth, userController.getMe);

export default router;
