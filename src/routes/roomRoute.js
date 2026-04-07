import Router from 'express';

import roomController from '../controllers/roomController.js';
const router = new Router();

router.get('/rooms', roomController.getAllRooms);

export default router;
