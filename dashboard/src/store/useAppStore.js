import { create } from 'zustand';

const useAppStore = create((set) => ({
  // ── Navigation ───────────────────────────────────
  activeSection: 'dashboard',
  setActiveSection: (section) => set({ activeSection: section }),

  // ── Active sede ──────────────────────────────────
  activeSede: 'Lima HQ',
  setActiveSede: (sede) => set({ activeSede: sede }),

  // ── Sidebar ──────────────────────────────────────
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  // ── Notifications ────────────────────────────────
  notificationCount: 9,
  clearNotifications: () => set({ notificationCount: 0 }),

  // ── System status ────────────────────────────────
  systemStatus: 'operational',   // 'operational' | 'degraded' | 'outage'
  totalEndpoints: 247,
  uptimePercent: '99.4',
}));

export default useAppStore;
