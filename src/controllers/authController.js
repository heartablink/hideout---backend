import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../config/db.js';

const registration = async (req, res) => {
  try {
    const { phone, password, name, surname } = req.body;

    //есть ли уже такой пользователь
    const existingUser = await prisma.user.findFirst({ where: { phone: phone } });

    if (existingUser) {
      return res.status(400).json({ message: 'Пользователь с таким телефоном уже существует' });
    }

    //хешируем пароль
    const salt = await bcrypt.genSalt(10);
    const hashPassword = await bcrypt.hash(password, salt);

    const newUser = await prisma.user.create({
      data: {
        phone: phone,
        password_hash: hashPassword,
        salt: salt,
        user_info: {
          create: {
            name: req.body.name,
            surname: req.body.surname,
            is_blocked: false,
          },
        },
        loyalty: {
          create: {
            loyalty_level_id: 1,
            xp_amount: 0,
            current_balance: 0.0,
          },
        },
        permission: {
          create: {
            role_id: 3,
          },
        },
      },
      include: {
        //добавит в объект newUser вложенные объекты с информацией о профиле и ролях.
        user_info: true,
        permission: true,
      },
    });

    //создаем jwt токен
    const token = jwt.sign(
      {
        id: newUser.user_id,
      },
      'secret123',
      {
        expiresIn: '30d',
      },
    );

    res.status(201).json({ ...newUser, token }); //оператор Spread (расширение)
  } catch (err) {
    console.log('Ошибка при регистрации: ', err);
    res.status(500).json({ message: 'Ошибка сервера при регистрации' });
  }
};

const authorization = async (req, res) => {
  try {
    const { phone, password } = req.body;

    const user = await prisma.user.findFirst({ where: { phone: phone } });

    if (!user) {
      return res.status(400).json({ message: 'Пользователь с таким логином не найден' });
    }

    const isValidPass = await bcrypt.compare(password, user.password_hash);

    if (!isValidPass) {
      return res.status(400).json({ message: 'неправльный телефон или пароль' });
    }
    const role = await prisma.permission.findFirst({
      where: { user_id: user.user_id },
      include: { role: true },
    });

    console.log('роль', role.role.name);
    //создаем токен с зашифрованными данными
    const token = jwt.sign(
      {
        id: user.user_id,
        role: role.role?.name_role,
      },
      'secret123',
      {
        expiresIn: '30d',
      },
    );
    const { password_hash, ...userData } = user;
    //иначе возврщает кучу служебных свойтсв и методов

    res.json({
      ...userData, //spread operatorm - для объединения объектов
      token,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: 'Не удалось авторизироваться' });
  }
};

export default {
  registration,
  authorization,
};
