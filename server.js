import app from './src/app.js';

const startApp = async () => {
  app.listen(4444, (err) => {
    if (err) console.log(err);

    console.log('Приложение успшено запущено! Привет!');
  });
};

startApp();
