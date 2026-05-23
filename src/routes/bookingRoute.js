import Router from 'express';

import bookingController from '../controllers/bookingController.js';
import checkAuth from '../middleware/checkAuth.js';
import checkRole from '../middleware/checkRole.js';
import checkActiveShift from '../middleware/checkActiveShift.js';

const router = new Router();

router.post('/bookings/create-deposit', checkAuth, bookingController.createBookingDeposit);

router.post('/bookings/create-external', checkAuth, bookingController.createBookingExternal);

router.post('/bookings/create-cash', checkAuth, bookingController.createBookingCash);

router.post('/payments/webhook', bookingController.handleYookassaWebhook);

router.get('/booking/status/:bookingId', bookingController.getBookingStatus);

router.get('/bookings/getUserBookings', checkAuth, bookingController.getUserBookings);

router.get(
  '/bookings/today',
  checkAuth,
  checkRole('Администратор', 'Менеджер'),
  checkActiveShift,
  bookingController.getTodayBookings,
);

router.post(
  '/bookings/:bookingId/start',
  checkAuth,
  checkRole('Администратор', 'Менеджер'),
  checkActiveShift,
  bookingController.startBooking,
);

router.post(
  '/bookings/:bookingId/complete',
  checkAuth,
  checkRole('Администратор', 'Менеджер'),
  checkActiveShift,
  bookingController.completeBooking,
);

router.post('/bookings/:bookingId/cancel', checkAuth, bookingController.cancelBooking);

router.post(
  '/bookings/create-guest',
  checkAuth,
  checkRole('Администратор', 'Менеджер'),
  checkActiveShift,
  bookingController.createGuestBooking,
);

export default router;
