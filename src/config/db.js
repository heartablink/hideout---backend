//инициализация Prisma orm
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default prisma;
