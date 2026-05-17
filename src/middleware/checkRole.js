// проверка на роль, только с определенными правами
//можно выполнять следующую фукнцию
const checkRole = (...allowedRoles) => {
  return (req, res, next) => {
    console.log('юзер', req.user, req.user.userId, req.user.userRole);
    // req.user должен быть установлен предыдущим middleware аутентификации
    if (!req.user || !req.user.userRole) {
      return res.status(401).json({ message: 'Не авторизован' });
    }

    const userRole = req.user.userRole; // 'client', 'admin', 'manager'
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ message: 'Недостаточно прав' });
    }

    next();
  };
};

export default checkRole;
