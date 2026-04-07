import Router from 'express';
import categoryController from '../controllers/categoryController.js';

const router = new Router();
router.get('/categories', categoryController.getCategories);

export default router;
