//проверяет токен jwt на доступ к действиям
import jwt from 'jsonwebtoken';

const checkAuth = (req, res, next) => {
  //передавать строку когда есть и когда нет токена и убрать из вывода слова Bearer
  const token = (req.headers.authorization || '').replace(/Bearer\s?/, '');

  if (token) {
    //расшифрока токена
    try {
      const decoded = jwt.verify(token, 'secret123');
      console.log('декодед: ', decoded);
      req.user = { userId: decoded.id }; // Создаем объект user и кладем туда userId
      next();
    } catch (e) {
      return res.status(403).json({
        message: 'Нет доступа, токен неверен или просрочен',
      }); //403 = нет доступа
    }
  } else {
    return res.status(403).json({
      message: 'Нет доступа, токен не найден',
    }); //403 = нет доступа
  }
};

export default checkAuth;
