import { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Plus,
  Search,
  X,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Eye,
  Edit3,
  Trash2,
  UserCheck,
  UserX,
  Mail,
  Lock,
  ChevronDown,
} from 'lucide-react';
import { api } from '../services/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Role {
  id: string;
  name: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  roleId: string;
  roleName?: string;
  isActive: boolean;
  createdAt?: string;
  lastLogin?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ROLE_STYLES: Record<string, { bg: string; text: string; border: string; icon: typeof Shield }> = {
  SuperAdmin: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20', icon: ShieldAlert },
  Admin: { bg: 'bg-brand/10', text: 'text-brand', border: 'border-brand/20', icon: ShieldCheck },
  Operator: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20', icon: Shield },
  Viewer: { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/20', icon: Eye },
};

function getRoleStyle(roleName: string) {
  return ROLE_STYLES[roleName] || ROLE_STYLES['Viewer'];
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// ─── Component ───────────────────────────────────────────────────────────────

export function UsersView() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('Todos');
  const [statusFilter, setStatusFilter] = useState('Todos');

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', email: '', password: '', roleId: '' });
  const [creating, setCreating] = useState(false);

  // Edit modal
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ name: '', roleId: '', isActive: true });
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ─── Data Fetching ──────────────────────────────────────────────────────────

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/users');
      setUsers(res.data);
      setError('');
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Error al cargar usuarios';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const res = await api.get('/roles');
      setRoles(res.data);
    } catch {
      // Fallback roles if endpoint doesn't exist yet
      setRoles([
        { id: '1', name: 'SuperAdmin' },
        { id: '2', name: 'Admin' },
        { id: '3', name: 'Operator' },
        { id: '4', name: 'Viewer' },
      ]);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchRoles();
  }, []);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!createForm.name.trim() || !createForm.email.trim() || !createForm.password.trim() || !createForm.roleId) return;
    setCreating(true);
    try {
      await api.post('/users', {
        name: createForm.name,
        email: createForm.email,
        password: createForm.password,
        roleId: createForm.roleId,
      });
      setShowCreateModal(false);
      setCreateForm({ name: '', email: '', password: '', roleId: '' });
      fetchUsers();
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Error al crear usuario';
      setError(msg);
    } finally {
      setCreating(false);
    }
  };

  const handleEdit = async () => {
    if (!editUser) return;
    setSaving(true);
    try {
      await api.patch(`/users/${editUser.id}`, {
        name: editForm.name,
        roleId: editForm.roleId,
        isActive: editForm.isActive,
      });
      setEditUser(null);
      fetchUsers();
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Error al actualizar usuario';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/users/${deleteTarget.id}`);
      setDeleteTarget(null);
      fetchUsers();
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Error al eliminar usuario';
      setError(msg);
    } finally {
      setDeleting(false);
    }
  };

  const openEditModal = (user: User) => {
    setEditForm({ name: user.name, roleId: user.roleId, isActive: user.isActive });
    setEditUser(user);
  };

  const openCreateModal = () => {
    setCreateForm({ name: '', email: '', password: '', roleId: roles[0]?.id || '' });
    setShowCreateModal(true);
  };

  // ─── Computed ───────────────────────────────────────────────────────────────

  const getRoleName = (roleId: string) => {
    return roles.find((r) => r.id === roleId)?.name || 'Viewer';
  };

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const roleName = u.roleName || getRoleName(u.roleId);
      const matchesSearch =
        !search ||
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase());
      const matchesRole = roleFilter === 'Todos' || roleName === roleFilter;
      const matchesStatus =
        statusFilter === 'Todos' ||
        (statusFilter === 'Activo' && u.isActive) ||
        (statusFilter === 'Deshabilitado' && !u.isActive);
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, search, roleFilter, statusFilter, roles]);

  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.isActive).length;
    const byRole: Record<string, number> = {};
    users.forEach((u) => {
      const name = u.roleName || getRoleName(u.roleId);
      byRole[name] = (byRole[name] || 0) + 1;
    });
    return { total, active, disabled: total - active, byRole };
  }, [users, roles]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-1.5 rounded-full bg-brand shadow-[0_0_8px_rgba(255,107,53,0.6)]" />
            <h3 className="text-brand font-bold text-[11px] tracking-[0.2em] uppercase">Control de Acceso</h3>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-text-primary tracking-tight">Gestion de Usuarios</h1>
          <p className="text-sm text-text-secondary mt-1">Administra usuarios, roles y permisos de la plataforma</p>
        </div>
        <button
          onClick={openCreateModal}
          className="self-start md:self-auto flex items-center gap-2 px-4 py-2.5 bg-brand text-white rounded-xl text-sm font-semibold hover:bg-brand-dark transition-all shadow-lg shadow-brand/20 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Nuevo Usuario
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-status-error/10 border border-status-error/20 rounded-xl px-4 py-3 text-sm text-status-error flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-status-error/60 hover:text-status-error">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <div className="glass-subtle rounded-2xl p-4 border border-surface-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-brand" />
            </div>
            <div>
              <p className="text-2xl font-black text-text-primary">{stats.total}</p>
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider font-semibold">Total</p>
            </div>
          </div>
        </div>
        <div className="glass-subtle rounded-2xl p-4 border border-surface-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-status-success/10 flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-status-success" />
            </div>
            <div>
              <p className="text-2xl font-black text-status-success">{stats.active}</p>
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider font-semibold">Activos</p>
            </div>
          </div>
        </div>
        <div className="glass-subtle rounded-2xl p-4 border border-surface-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-black text-text-primary">{stats.byRole['SuperAdmin'] || 0}</p>
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider font-semibold">SuperAdmin</p>
            </div>
          </div>
        </div>
        <div className="glass-subtle rounded-2xl p-4 border border-surface-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-black text-text-primary">{stats.byRole['Operator'] || 0}</p>
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider font-semibold">Operadores</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o email..."
            className="w-full pl-10 pr-4 py-2.5 bg-surface-elevated/50 border border-surface-border rounded-xl text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand/50 focus:bg-surface-elevated transition-all"
          />
        </div>
        <div className="flex gap-3">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="flex-1 md:w-40 bg-surface-elevated/50 border border-surface-border rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-brand/50 transition-all appearance-none"
          >
            <option value="Todos">Todos los Roles</option>
            {roles.map((r) => (
              <option key={r.id} value={r.name}>
                {r.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="flex-1 md:w-40 bg-surface-elevated/50 border border-surface-border rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-brand/50 transition-all appearance-none"
          >
            <option value="Todos">Todos</option>
            <option value="Activo">Activos</option>
            <option value="Deshabilitado">Deshabilitados</option>
          </select>
        </div>
      </div>

      {/* Users Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="glass-subtle rounded-2xl border border-surface-border p-5 space-y-4">
              <div className="flex gap-3">
                <div className="w-11 h-11 rounded-xl skeleton-box" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/2 rounded skeleton-box" />
                  <div className="h-3 w-3/4 rounded skeleton-box" />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="h-5 w-20 rounded-lg skeleton-box" />
                <div className="h-5 w-20 rounded-lg skeleton-box" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-8 bg-surface-elevated/30 rounded-2xl border border-dashed border-surface-border">
          <Users className="w-16 h-16 text-text-tertiary/30 mb-4" />
          <p className="text-text-primary font-semibold text-lg mb-1">Sin usuarios encontrados</p>
          <p className="text-text-tertiary text-sm max-w-sm text-center mb-6">
            {users.length === 0
              ? 'Crea el primer usuario para comenzar a gestionar el acceso.'
              : 'Prueba ajustando los filtros de busqueda.'}
          </p>
          {users.length === 0 && (
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-xl text-sm font-semibold hover:bg-brand-dark transition-all"
            >
              <Plus className="w-4 h-4" /> Crear Primer Usuario
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((user) => {
            const roleName = user.roleName || getRoleName(user.roleId);
            const style = getRoleStyle(roleName);
            const RoleIcon = style.icon;

            return (
              <div
                key={user.id}
                className={`glass-subtle rounded-2xl border border-surface-border p-5 transition-all duration-300 hover-card group ${
                  !user.isActive ? 'opacity-60' : ''
                }`}
              >
                {/* User Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold border ${style.bg} ${style.text} ${style.border}`}
                    >
                      {getInitials(user.name)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-text-primary truncate">{user.name}</h3>
                      <p className="text-xs text-text-tertiary truncate">{user.email}</p>
                    </div>
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEditModal(user)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface-elevated transition-colors"
                      title="Editar usuario"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(user)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-text-tertiary hover:text-status-error hover:bg-status-error/10 transition-colors"
                      title="Eliminar usuario"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Role & Status */}
                <div className="flex items-center gap-2 mt-4">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${style.bg} ${style.text} ${style.border}`}
                  >
                    <RoleIcon className="w-3 h-3" />
                    {roleName}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                      user.isActive
                        ? 'bg-status-success/10 text-status-success border border-status-success/20'
                        : 'bg-surface-elevated text-text-tertiary border border-surface-border'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${user.isActive ? 'bg-status-success' : 'bg-text-tertiary'}`}
                    />
                    {user.isActive ? 'Activo' : 'Deshabilitado'}
                  </span>
                </div>

                {/* Footer info */}
                {user.createdAt && (
                  <p className="text-[10px] text-text-tertiary mt-3 pt-3 border-t border-surface-border/50">
                    Creado: {new Date(user.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ Create User Modal ═══ */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="bg-surface-base border border-surface-border rounded-2xl w-full max-w-md p-6 animate-spring-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-text-primary">Nuevo Usuario</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface-elevated transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="text-xs font-semibold text-text-secondary mb-1.5 block">Nombre Completo</label>
                <div className="relative">
                  <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
                  <input
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                    placeholder="Ej: Juan Perez"
                    className="w-full pl-10 pr-4 py-2.5 bg-surface-elevated border border-surface-border rounded-xl text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand/50 transition-all"
                    autoFocus
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="text-xs font-semibold text-text-secondary mb-1.5 block">Correo Electronico</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
                  <input
                    value={createForm.email}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                    placeholder="usuario@empresa.com"
                    type="email"
                    className="w-full pl-10 pr-4 py-2.5 bg-surface-elevated border border-surface-border rounded-xl text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand/50 transition-all"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="text-xs font-semibold text-text-secondary mb-1.5 block">Contrasena</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
                  <input
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    placeholder="Minimo 8 caracteres"
                    type="password"
                    className="w-full pl-10 pr-4 py-2.5 bg-surface-elevated border border-surface-border rounded-xl text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand/50 transition-all"
                  />
                </div>
              </div>

              {/* Role */}
              <div>
                <label className="text-xs font-semibold text-text-secondary mb-1.5 block">Rol</label>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
                  <select
                    value={createForm.roleId}
                    onChange={(e) => setCreateForm({ ...createForm, roleId: e.target.value })}
                    className="w-full pl-10 pr-10 py-2.5 bg-surface-elevated border border-surface-border rounded-xl text-sm text-text-primary focus:outline-none focus:border-brand/50 transition-all appearance-none"
                  >
                    <option value="" disabled>
                      Seleccionar rol...
                    </option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-text-secondary border border-surface-border hover:bg-surface-elevated transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !createForm.name.trim() || !createForm.email.trim() || !createForm.password.trim() || !createForm.roleId}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-brand text-white hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? 'Creando...' : 'Crear Usuario'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Edit User Modal ═══ */}
      {editUser && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setEditUser(null)}
        >
          <div
            className="bg-surface-base border border-surface-border rounded-2xl w-full max-w-md p-6 animate-spring-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-text-primary">Editar Usuario</h3>
              <button
                onClick={() => setEditUser(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface-elevated transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* User Info Header */}
            <div className="flex items-center gap-3 mb-5 p-3 bg-surface-elevated/50 rounded-xl border border-surface-border/50">
              <div className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center text-sm font-bold text-brand">
                {getInitials(editUser.name)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text-primary truncate">{editUser.name}</p>
                <p className="text-xs text-text-tertiary truncate">{editUser.email}</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="text-xs font-semibold text-text-secondary mb-1.5 block">Nombre</label>
                <input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2.5 bg-surface-elevated border border-surface-border rounded-xl text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand/50 transition-all"
                />
              </div>

              {/* Role */}
              <div>
                <label className="text-xs font-semibold text-text-secondary mb-1.5 block">Rol Asignado</label>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
                  <select
                    value={editForm.roleId}
                    onChange={(e) => setEditForm({ ...editForm, roleId: e.target.value })}
                    className="w-full pl-10 pr-10 py-2.5 bg-surface-elevated border border-surface-border rounded-xl text-sm text-text-primary focus:outline-none focus:border-brand/50 transition-all appearance-none"
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
                </div>
              </div>

              {/* Status Toggle */}
              <div>
                <label className="text-xs font-semibold text-text-secondary mb-1.5 block">Estado de la Cuenta</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditForm({ ...editForm, isActive: true })}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                      editForm.isActive
                        ? 'bg-status-success/10 border-status-success/30 text-status-success'
                        : 'bg-surface-elevated/50 border-surface-border text-text-tertiary hover:text-text-secondary'
                    }`}
                  >
                    <UserCheck className="w-4 h-4" />
                    Activo
                  </button>
                  <button
                    onClick={() => setEditForm({ ...editForm, isActive: false })}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                      !editForm.isActive
                        ? 'bg-status-error/10 border-status-error/30 text-status-error'
                        : 'bg-surface-elevated/50 border-surface-border text-text-tertiary hover:text-text-secondary'
                    }`}
                  >
                    <UserX className="w-4 h-4" />
                    Deshabilitado
                  </button>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditUser(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-text-secondary border border-surface-border hover:bg-surface-elevated transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleEdit}
                disabled={saving || !editForm.name.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-brand text-white hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Delete Confirmation Modal ═══ */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="bg-surface-base border border-surface-border rounded-2xl w-full max-w-sm p-6 animate-spring-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-status-error/10 border border-status-error/20 flex items-center justify-center mb-4">
                <Trash2 className="w-6 h-6 text-status-error" />
              </div>
              <h3 className="text-lg font-bold text-text-primary mb-1">Eliminar Usuario</h3>
              <p className="text-sm text-text-secondary mb-1">
                Esta accion no se puede deshacer.
              </p>
              <p className="text-sm text-text-tertiary">
                Se eliminara permanentemente a <span className="font-semibold text-text-primary">{deleteTarget.name}</span> del sistema.
              </p>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-text-secondary border border-surface-border hover:bg-surface-elevated transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-status-error text-white hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
