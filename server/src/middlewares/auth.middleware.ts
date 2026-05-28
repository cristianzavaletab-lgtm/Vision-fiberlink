import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/prisma';

interface JwtPayload {
  userId: string;
  roleId: string;
  companyId: string;
}

// Augment Express Request
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload & { roleName?: string, permissions?: string[] };
    }
  }
}

export const authRequired = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  const secret = process.env.JWT_ACCESS_SECRET;

  if (!secret) {
    console.warn('⚠️ Missing JWT_ACCESS_SECRET in environment.');
    // Graceful degradation if env not set fully, allow for now or block depending on strictness
    // To not break production legacy, we might mock it if prisma isn't active
    if (!prisma) {
       req.user = { userId: 'legacy', roleId: 'legacy', companyId: 'legacy', roleName: 'SuperAdmin', permissions: [] };
       return next();
    }
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  try {
    const decoded = jwt.verify(token, secret) as JwtPayload;
    req.user = decoded;

    // Fetch user role and permissions if Prisma is available
    if (prisma) {
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: {
          role: { include: { permissions: true } }
        }
      });
      
      if (user && user.isActive) {
        req.user.roleName = user.role.name;
        req.user.permissions = user.role.permissions.map(p => p.action);
      } else {
        return res.status(401).json({ error: 'User disabled or not found' });
      }
    }
    
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!prisma) return next(); // Fallback for legacy
    if (!req.user || !req.user.roleName) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!allowedRoles.includes(req.user.roleName) && req.user.roleName !== 'SuperAdmin') {
      return res.status(403).json({ error: 'Insufficient role' });
    }
    next();
  };
};

export const requirePermission = (requiredPermission: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!prisma) return next(); // Fallback for legacy
    if (!req.user || !req.user.permissions) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (req.user.roleName === 'SuperAdmin') return next();
    
    if (!req.user.permissions.includes(requiredPermission)) {
      return res.status(403).json({ error: 'Insufficient permission' });
    }
    next();
  };
};
