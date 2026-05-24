//проверяет токен jwt на доступ к действиям
import jwt from 'jsonwebtoken';
import prisma from '../config/db.js';

const checkAuth = async (req, res, next) => {
  //передавать строку когда есть и когда нет токена и убрать из вывода слова Bearer
  const token = (req.headers.authorization || '').replace(/Bearer\s?/, '');

  if (token) {
    //расшифрока токена
    try {
      const decoded = jwt.verify(token, 'secret123');
      const userInfo = await prisma.user_info.findUnique({
        where: { user_id: decoded.id },
        select: { is_deleted: true },
      });

      if (userInfo?.is_deleted) {
        return res.status(403).json({ message: 'Аккаунт удалён' });
      }
      console.log('декодед: ', decoded);
      console.log(token);
      req.user = { userId: decoded.id, userRole: decoded.role }; // Создаем объект user и кладем туда userId
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
