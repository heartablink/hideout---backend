import Router from 'express';

import gameControler from '../controllers/gamesController.js';

const router = new Router();

router.get('/games', gameControler.getGames);

export default router;
