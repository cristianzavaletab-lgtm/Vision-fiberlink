import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../db/prisma';
import { createAuditLog } from '../db/services/audit.service';
import { authRequired } from '../middlewares/auth.middleware';
import { pwaStore } from '../services/pwaStore';
import { loadData } from '../services/dataStore';

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
    // MVP mode: validate against in-memory users with bcrypt
    const { email, password } = req.body;
    const memoryUsers = loadData<Array<{ id: string; name: string; email: string; password: string; roleId: string; roleName: string; isActive: boolean }>>('users', []);
    const user = memoryUsers.find(u => u.email === email && u.isActive);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const secret = process.env.JWT_ACCESS_SECRET || 'dev-secret-change-me';
    const payload = { userId: user.id, roleId: user.roleId, companyId: 'default' };
    const accessToken = jwt.sign(payload, secret, { expiresIn: '1d' });
    const refreshToken = jwt.sign(payload, secret, { expiresIn: '7d' });
    
    return res.json({ 
      accessToken, 
      refreshToken, 
      user: { id: user.id, name: user.name, email: user.email, role: user.roleName } 
    });
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
  if (!prisma) {
    // MVP mode: look up user from in-memory store
    const memoryUsers = loadData<Array<{ id: string; name: string; email: string; roleId: string; roleName: string; isActive: boolean }>>('users', []);
    const user = memoryUsers.find(u => u.id === req.user?.userId);
    if (user) {
      return res.json({ id: user.id, name: user.name, email: user.email, role: user.roleName });
    }
    return res.json(req.user);
  }
  
  const user = await prisma.user.findUnique({
    where: { id: req.user?.userId },
    select: { id: true, name: true, email: true, role: true, company: true }
  });
  res.json(user);
});

// ==========================================
// PWA WEBAUTHN / BIOMETRIC AUTH ENDPOINTS
// ==========================================

// 1. Register Challenge: Get challenge for registering a biometric key
router.post('/webauthn/register-challenge', authRequired, (req, res) => {
  const challengeData = pwaStore.createChallenge(req.user!.userId);
  res.json(JSON.parse(challengeData));
});

// 2. Register Credential: Save the user's public key
router.post('/webauthn/register', authRequired, async (req, res) => {
  try {
    const { credentialId, publicKey, challengeId } = req.body;
    if (!credentialId || !publicKey || !challengeId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const savedChallenge = pwaStore.getChallenge(challengeId);
    if (!savedChallenge) {
      return res.status(400).json({ error: 'Invalid or expired challenge' });
    }

    // Register credential in pwaStore
    pwaStore.registerCredential(req.user!.userId, {
      credentialId,
      publicKey, // Public key in base64 SPKI format or PEM format
      userId: req.user!.userId,
      counter: 0
    });

    await createAuditLog({ 
      action: 'BIOMETRIC_REGISTER', 
      description: `Registro biometrico exitoso`, 
      userId: req.user!.userId, 
      companyId: req.user!.companyId 
    });

    res.json({ success: true, message: 'Acceso biometrico registrado con exito' });
  } catch (error) {
    console.error('[WebAuthn Register Error]:', error);
    res.status(500).json({ error: 'Error al registrar credenciales biometricas' });
  }
});

// 3. Login Challenge: Get challenge for logging in
router.post('/webauthn/login-challenge', (req, res) => {
  const challengeData = pwaStore.createChallenge();
  res.json(JSON.parse(challengeData));
});

// 4. Login: Verify biometric signature and issue JWT
router.post('/webauthn/login', async (req, res) => {
  try {
    const { credentialId, challengeId, signature, email } = req.body;
    if (!credentialId || !challengeId || !signature) {
      return res.status(400).json({ error: 'Faltan parametros de autenticacion' });
    }

    const challenge = pwaStore.getChallenge(challengeId);
    if (!challenge) {
      return res.status(400).json({ error: 'Desafio invalido o expirado' });
    }

    // Find the biometric credential in store
    const credential = pwaStore.findCredentialById(credentialId);
    if (!credential) {
      return res.status(401).json({ error: 'Credencial biometrica no registrada en este servidor' });
    }

    // Verify signature using Node's crypto
    const verifier = crypto.createVerify('SHA256');
    verifier.update(challenge);
    verifier.end();

    const publicKeyPem = `-----BEGIN PUBLIC KEY-----\n${credential.publicKey}\n-----END PUBLIC KEY-----`;
    
    let isSignatureValid = false;
    try {
      isSignatureValid = verifier.verify(publicKeyPem, signature, 'base64');
    } catch (err) {
      console.error('[WebAuthn Verify Cryptography Error]:', err);
      return res.status(401).json({ error: 'Firma criptografica invalida' });
    }

    if (!isSignatureValid) {
      return res.status(401).json({ error: 'Autenticacion biometrica fallida' });
    }

    // If valid, look up the user
    let user;
    if (prisma) {
      user = await prisma.user.findUnique({ 
        where: { id: credential.userId }, 
        include: { role: true } 
      });
    } else {
      // Legacy mock fallback
      user = { id: 'legacy', name: 'Legacy Admin', email: 'admin@vision.control', role: { name: 'legacy' }, companyId: 'legacy', roleId: 'legacy', isActive: true };
    }

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Usuario inactivo o no encontrado' });
    }

    const accessSecret = process.env.JWT_ACCESS_SECRET || 'secret';
    const refreshSecret = process.env.JWT_REFRESH_SECRET || 'secret_refresh';

    const payload = { userId: user.id, roleId: user.roleId, companyId: user.companyId };
    
    const accessToken = jwt.sign(payload, accessSecret, { expiresIn: (process.env.ACCESS_TOKEN_TTL || '15m') as any });
    const refreshToken = jwt.sign(payload, refreshSecret, { expiresIn: (process.env.REFRESH_TOKEN_TTL || '7d') as any });

    await createAuditLog({ 
      action: 'LOGIN_BIOMETRIC_SUCCESS', 
      description: `Login biometrico exitoso: ${user.email}`, 
      userId: user.id, 
      companyId: user.companyId 
    });

    res.json({
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role.name }
    });
  } catch (error) {
    console.error('[WebAuthn Login Error]:', error);
    res.status(500).json({ error: 'Error interno en el servidor durante login biometrico' });
  }
});

export default router;
