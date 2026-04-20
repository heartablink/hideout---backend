import Router from 'express';

import roomController from '../controllers/roomController.js';
const router = new Router();

router.get('/rooms', roomController.getActiveRooms);
router.get('/room/:roomId', roomController.getRoom);
router.get('/room/:roomId/slots', roomController.getSlots);

export default router;
