import express from 'express';
import cors from 'cors';

import roomRouter from './routes/roomRoute.js';
import authRoute from './routes/authRoute.js';
import gamesRoute from './routes/gamesRoute.js';
import categoryRouter from './routes/categoryRoute.js';
import branchRouter from './routes/branchRoute.js';
import bookingRouter from './routes/bookingRoute.js';
import userRoute from './routes/userRoute.js';
import loyaltyRoute from './routes/loyaltyRoute.js';
import shiftRoute from './routes/shiftRoute.js';
import packageRoute from './routes/packageRoute.js';
import managerRoute from './routes/managerRoute.js';

//задачи крон
import { initCronJobs } from './services/cronJobs.js';

const app = express();
initCronJobs();

// Этот код учит JSON работать с числами BigInt
BigInt.prototype.toJSON = function () {
  return this.toString();
};

app.use(express.json());

//изменить на конкретный фронт позже
app.use(
  cors({
    origin: 'http://localhost:3000',
  }),
);

app.use(
  '/api',
  authRoute,
  roomRouter,
  gamesRoute,
  categoryRouter,
  branchRouter,
  bookingRouter,
  userRoute,
  loyaltyRoute,
  shiftRoute,
  packageRoute,
  managerRoute,
);
app.use('/uploads', express.static('uploads'));

export default app;
