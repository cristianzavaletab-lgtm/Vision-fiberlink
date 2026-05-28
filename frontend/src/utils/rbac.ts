import { useAuth } from '../context/AuthContext';

export function useRBAC() {
  const { user } = useAuth();

  const hasRole = (allowedRoles: string[]) => {
    if (!user) return false;
    if (user.role === 'SuperAdmin') return true;
    return allowedRoles.includes(user.role);
  };

  const hasPermission = (permission: string) => {
    if (!user) return false;
    if (user.role === 'SuperAdmin') return true;
    if (!user.permissions) return true; // Fallback legacy if permissions array missing
    return user.permissions.includes(permission);
  };

  return { hasRole, hasPermission };
}
