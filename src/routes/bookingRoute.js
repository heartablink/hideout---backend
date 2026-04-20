import Router from 'express';

import bookingController from '../controllers/bookingController.js';
import checkAuth from '../middleware/checkAuth.js';

const router = new Router();

router.post(
  '/bookings/create-deposit', //путь
  checkAuth,
  bookingController.createBooking,
);

export default router;
