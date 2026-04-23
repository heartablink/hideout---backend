import cron from 'node-cron';
import prisma from '../config/db.js';

export const initCronJobs = () => {
  cron.schedule('*/10 * * * *', async () => {
    const fifteenMinutesAgo = new Date(
      new Date(new Date().getTime() + 3 * 60 * 60 * 1000),
      -15 * 60 * 1000,
    );
    await prisma.booking.updateMany({
      where: {
        status_id: 2,
        is_paid: false,
        created_at: { lt: fifteenMinutesAgo },
      },
      data: {
        status_id: 5,
      },
    });
    console.log('[CRON] Проверка просроченных броней завершена');
  });
};
