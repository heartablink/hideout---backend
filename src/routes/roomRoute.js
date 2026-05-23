import Router from 'express';
import checkAuth from '../middleware/checkAuth.js';
import checkRole from '../middleware/checkRole.js';
import roomController from '../controllers/roomController.js';
const router = new Router();

router.get('/rooms', roomController.getActiveRooms);
router.get('/room/:roomId', roomController.getRoom);
router.get('/room/:roomId/slots', roomController.getSlots);

router.get(
  '/admin/branchrooms',
  checkAuth,
  checkRole('Администратор', 'Управляющий'),
  roomController.getBranchRooms,
);

export default router;
