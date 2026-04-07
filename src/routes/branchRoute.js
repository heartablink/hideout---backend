import { Router } from 'express';

import branchController from '../controllers/branchController.js';

const router = new Router();

router.get('/branches', branchController.getBranches);

export default router;
