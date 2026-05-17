import Router from 'express';

import loyaltyControler from '../controllers/loyaltyController.js';

const router = new Router();

router.get('/levelLoyalty/:level', loyaltyControler.getLevel);

export default router;
