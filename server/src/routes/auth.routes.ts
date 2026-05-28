import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/prisma';
import { createAuditLog } from '../db/services/audit.service';
import { authRequired } from '../middlewares/auth.middleware';

const router = Router();

// Registration endpoint (usually protected, but kept open for initial setup)
router.post('/register', async (req, res) => {
  if (!prisma) {
    return res.status(503).json({ error: 'Database not configured yet. Operating in legacy mode.' });
  }

  try {
    const { email, password, name, companyId, roleId } = req.body;
    
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: 'User already exists' });

    const rounds = parseInt(process.env.BCRYPT_ROUNDS || '10');
    const hashedPassword = await bcrypt.hash(password, rounds);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        companyId,
        roleId
      }
    });

    res.status(201).json({ message: 'User created successfully', userId: user.id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', async (req, res) => {
  if (!prisma) {
    // Mock login for legacy mode
    const token = jwt.sign({ userId: 'legacy', roleId: 'legacy', companyId: 'legacy' }, process.env.JWT_ACCESS_SECRET || 'secret', { expiresIn: '1d' });
    return res.json({ accessToken: token, refreshToken: token, user: { name: 'Legacy Admin' } });
  }

  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email }, include: { role: true } });

    if (!user || !user.isActive) {
      await createAuditLog({ action: 'LOGIN_FAILED', description: `Intento de login fallido para: ${email}`, status: 'failed' });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      await createAuditLog({ action: 'LOGIN_FAILED', description: `Intento de login fallido para: ${email}`, status: 'failed', companyId: user.companyId });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const accessSecret = process.env.JWT_ACCESS_SECRET;
    const refreshSecret = process.env.JWT_REFRESH_SECRET;
    
    if (!accessSecret || !refreshSecret) {
      return res.status(500).json({ error: 'Server misconfiguration (secrets missing)' });
    }

    const payload = { userId: user.id, roleId: user.roleId, companyId: user.companyId };
    
    const accessToken = jwt.sign(payload, accessSecret, { expiresIn: (process.env.ACCESS_TOKEN_TTL || '15m') as any });
    const refreshToken = jwt.sign(payload, refreshSecret, { expiresIn: (process.env.REFRESH_TOKEN_TTL || '7d') as any });

    await createAuditLog({ action: 'LOGIN_SUCCESS', description: `Login exitoso: ${email}`, userId: user.id, companyId: user.companyId });

    res.json({
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role.name }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });

  const refreshSecret = process.env.JWT_REFRESH_SECRET;
  if (!refreshSecret) return res.status(500).json({ error: 'Server misconfiguration' });

  try {
    const decoded = jwt.verify(refreshToken, refreshSecret) as any;
    const payload = { userId: decoded.userId, roleId: decoded.roleId, companyId: decoded.companyId };
    const accessSecret = process.env.JWT_ACCESS_SECRET;
    
    if (!accessSecret) throw new Error();

    const accessToken = jwt.sign(payload, accessSecret, { expiresIn: (process.env.ACCESS_TOKEN_TTL || '15m') as any });
    res.json({ accessToken });
  } catch (error) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

router.post('/logout', authRequired, async (req, res) => {
  // Simple logout. For full security, implement token blacklisting or refresh token rotation in DB.
  if (req.user) {
    await createAuditLog({ action: 'LOGOUT', description: `Logout exitoso`, userId: req.user.userId, companyId: req.user.companyId });
  }
  res.json({ message: 'Logged out successfully' });
});

router.get('/me', authRequired, async (req, res) => {
  if (!prisma) return res.json(req.user);
  
  const user = await prisma.user.findUnique({
    where: { id: req.user?.userId },
    select: { id: true, name: true, email: true, role: true, company: true }
  });
  res.json(user);
});

export default router;
