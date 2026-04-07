import { body } from 'express-validator';

export const registerValidator = [
  body('password')
    .isLength({ min: 5 })
    .withMessage('Пароль должен быть не менее 5 символов')
    .matches(/^(?=.*[A-Za-z])(?=.*\d)/)
    .withMessage('Пароль должен содержать буквы и цифры'),
];
