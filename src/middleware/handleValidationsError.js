//как validationResult из express-validator чтобы не прописывать его в каждом контроллере
import { validationResult } from 'express-validator';
// если есть ошибка при валидации код дальше выполняься не будет
export default (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json(errors.array());
  }

  next();
};
