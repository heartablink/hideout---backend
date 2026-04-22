import Router from 'express';

import bookingController from '../controllers/bookingController.js';
import checkAuth from '../middleware/checkAuth.js';

const router = new Router();

router.post(
  '/bookings/create-deposit', //путь
  checkAuth,
  bookingController.createBookingDeposit,
);

router.post(
  '/bookings/create-external', //путь
  checkAuth,
  bookingController.createBookingExternal,
);

router.post('/payments/webhook', bookingController.handleYookassaWebhook);

router.get('/booking/status/:bookingId', bookingController.getBookingStatus);

export default router;
