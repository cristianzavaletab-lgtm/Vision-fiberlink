import { prisma } from './prisma';
import bcrypt from 'bcrypt';

let defaultCompanyId = '';

export async function setupDb() {
  if (!prisma) {
    console.warn('⚠️ setupDb: Prisma no esta inicializado. Omitiendo migracion.');
    return;
  }

  try {
    let company = await prisma.company.findFirst({ where: { name: 'VisionControl' } });
    if (!company) {
      company = await prisma.company.create({ data: { name: 'VisionControl', isActive: true } });
    }
    defaultCompanyId = company.id;

    let role = await prisma.role.findFirst({ where: { name: 'admin' } });
    if (!role) {
      role = await prisma.role.create({ data: { name: 'admin', description: 'Administrador del Sistema' } });
    }

    let adminUser = await prisma.user.findUnique({ where: { email: 'admin@visioncontrol.app' } });
    if (!adminUser) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await prisma.user.create({
        data: {
          email: 'admin@visioncontrol.app',
          password: hashedPassword,
          name: 'Super Admin',
          companyId: company.id,
          roleId: role.id,
          isActive: true
        }
      });
      console.log('✅ Usuario admin@visioncontrol.app creado por defecto. (Password: admin123)');
    }

    const rulesCount = await prisma.alertRule.count();
    if (rulesCount === 0) {
      await prisma.alertRule.createMany({
        data: [
          { companyId: company.id, name: 'CPU Alto', type: 'cpu_high', metric: 'cpu', operator: '>', value: '90', duration: 60, action: 'notify_and_log', enabled: true },
          { companyId: company.id, name: 'RAM Alta', type: 'ram_high', metric: 'ram', operator: '>', value: '90', duration: 30, action: 'notify', enabled: true }
        ]
      });
      console.log('✅ Reglas de alerta creadas.');
    }
  } catch (error) {
    console.error('❌ Error inicializando base de datos:', error);
  }
}

export function getDefaultCompanyId() {
  return defaultCompanyId || 'default';
}
