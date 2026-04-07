import express from 'express';
import cors from 'cors';

import roomRouter from './routes/roomRoute.js';
import authRoute from './routes/authRoute.js';
import gamesRoute from './routes/gamesRoute.js';
import categoryRouter from './routes/categoryRoute.js';
import branchRouter from './routes/branchRoute.js';

const app = express();

app.use(express.json());

//изменить на конкретный фронт позже
app.use(
  cors({
    origin: 'http://localhost:3000',
  }),
);

app.use('/api', authRoute, roomRouter, gamesRoute, categoryRouter, branchRouter);
app.use('/uploads', express.static('uploads'));

export default app;
