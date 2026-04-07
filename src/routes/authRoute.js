import Router from 'express';
import handleValidationsError from '../middleware/handleValidationsError.js';

import { registerValidator } from '../middleware/registerValidator.js';

import authController from '../controllers/authController.js';

const router = new Router();

router.post(
  '/auth/register', //путь
  registerValidator, //проверка на коректность введеных данных, получаемых из тела запроса req.body
  handleValidationsError, //записал ли что то предудыщий файл об ошибках
  authController.registration, //если чисто, вызывается этот
);

router.post('/auth/login', handleValidationsError, authController.authorization);

export default router;
