import { api } from './api';

export type PeriodKey = 'today' | 'week' | 'month' | 'previous-month' | 'year' | 'custom';

export interface PaginatedResponse<T> {
  page: number;
  pageSize: number;
  total: number;
  rows: T[];
}

export interface DriveStatus {
  mode?: string;
  readOnly?: boolean;
  folderId?: string;
  lastSyncAt?: string | null;
  nextSyncAt?: string | null;
  running?: boolean;
  filesFound?: number;
  processed?: number;
  errors?: number;
  unreadNotifications?: number;
  documents?: DriveDocument[];
}

export interface DriveSheet {
  id: string;
  name: string;
  category?: string;
  rowCount?: number;
  lastSyncAt?: string | null;
}

export interface DriveDocument {
  id: string;
  name?: string;
  googleFileId?: string;
  url?: string;
  mimeType?: string;
  status?: string;
  lastSyncAt?: string | null;
  knownModifiedAt?: string | null;
  updatedAt?: string | null;
  lastError?: string | null;
  sheets?: DriveSheet[];
}

export interface FinancialRecord {
  id: string;
  date?: string | null;
  originalDate?: string | null;
  description?: string | null;
  category?: string | null;
  provider?: string | null;
  customer?: string | null;
  status?: string | null;
  amount?: string | number | null;
  paymentMethod?: string | null;
  responsible?: string | null;
  quantity?: string | number | null;
  unitCost?: string | number | null;
  priority?: string | null;
  document?: { id: string; name?: string; url?: string | null } | null;
  sheet?: { id: string; name?: string; category?: string | null } | null;
}

export interface FinanceSummary {
  today?: {
    income?: string | number;
    expense?: string | number;
    net?: string | number;
    incomeCount?: number;
    expenseCount?: number;
  };
  month?: {
    income?: string | number;
    expense?: string | number;
    net?: string | number;
    incomeCount?: number;
    expenseCount?: number;
    averageIncome?: string | number;
    averageExpense?: string | number;
    highestIncome?: string | number;
    highestExpense?: string | number;
  };
  purchases?: {
    pendingCount?: number;
    committed?: string | number;
    projectedBalance?: string | number;
  };
  documents?: {
    updatedToday?: number;
    total?: number;
    lastActivity?: string | null;
  };
  changes?: {
    totalRecent?: number;
    last?: DriveChange | null;
  };
  alerts?: {
    important?: number;
    negativeBalance?: boolean;
  };
}

export interface FinanceGroup {
  name: string;
  income?: string | number;
  expense?: string | number;
  count?: number;
}

export interface FinanceComparison {
  current?: { income?: number; expense?: number };
  previous?: { income?: number; expense?: number };
  variation?: number | null;
  comparable?: boolean;
}

export interface DriveChange {
  id: string;
  detectedAt?: string;
  changeType?: string;
  fieldName?: string | null;
  previousValue?: string | null;
  newValue?: string | null;
  importance?: string | null;
  reviewStatus?: string | null;
  rowKey?: string | null;
  document?: { id: string; name?: string; url?: string | null } | null;
  sheet?: { id: string; name?: string } | null;
}

export interface EnterpriseNotification {
  id: string;
  type?: string;
  title?: string;
  message?: string;
  priority?: string;
  importance?: string;
  read?: boolean;
  createdAt?: string;
  documentId?: string | null;
  amount?: string | number | null;
}

export interface EnterpriseReport {
  id: string;
  type?: string;
  title?: string;
  status?: string;
  periodStart?: string;
  periodEnd?: string;
  createdAt?: string;
}

export interface HealthStatus {
  status?: string;
  db?: string;
  timestamp?: string;
}

export interface RecordFilters {
  search?: string;
  type?: string;
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
  status?: string;
  category?: string;
  provider?: string;
  documentId?: string;
}

export function numberValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return 0;
  return Number(value) || 0;
}

export function formatMoney(value: string | number | null | undefined) {
  return `S/ ${numberValue(value).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDateTime(value?: string | number | null) {
  if (!value) return 'Sin registro';
  return new Date(value).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatRelative(value?: string | number | null) {
  if (!value) return 'Sin sincronizar';
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(Math.round(diff / 60000), 0);
  if (minutes < 1) return 'hace unos segundos';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return formatDateTime(value);
}

export function dateRangeForPeriod(period: PeriodKey) {
  const now = new Date();
  const from = new Date(now);
  const to = new Date(now);
  if (period === 'today') from.setHours(0, 0, 0, 0);
  if (period === 'week') {
    from.setDate(now.getDate() - 6);
    from.setHours(0, 0, 0, 0);
  }
  if (period === 'month') {
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
  }
  if (period === 'previous-month') {
    from.setMonth(now.getMonth() - 1, 1);
    from.setHours(0, 0, 0, 0);
    to.setDate(0);
    to.setHours(23, 59, 59, 999);
  }
  if (period === 'year') {
    from.setMonth(0, 1);
    from.setHours(0, 0, 0, 0);
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

const unwrapRows = <T>(data: PaginatedResponse<T> | T[] | undefined): T[] => Array.isArray(data) ? data : data?.rows || [];

const emptyPage = <T>(pageSize = 50): PaginatedResponse<T> => ({ page: 1, pageSize, total: 0, rows: [] });

export const enterpriseApi = {
  async getHealth(signal?: AbortSignal) {
    try {
      const { data } = await api.get<HealthStatus>('/health', { signal });
      return data;
    } catch {
      return { status: 'DEGRADED', db: 'error', timestamp: new Date().toISOString() } satisfies HealthStatus;
    }
  },
  async getDriveStatus(signal?: AbortSignal) {
    try {
      const { data } = await api.get<DriveStatus>('/drive/status', { signal });
      return data;
    } catch {
      return { mode: 'public', readOnly: true, running: false, filesFound: 0, processed: 0, errors: 0, documents: [] } satisfies DriveStatus;
    }
  },
  async syncDrive(signal?: AbortSignal) {
    const { data } = await api.post('/drive/sync', {}, { signal });
    return data;
  },
  async getDriveDocuments(filters: RecordFilters = {}, signal?: AbortSignal) {
    try {
      const { data } = await api.get<PaginatedResponse<DriveDocument>>('/drive/documents', { params: filters, signal });
      return data;
    } catch {
      return emptyPage<DriveDocument>(Number(filters.pageSize || 50));
    }
  },
  async addDriveDocument(url: string, signal?: AbortSignal) {
    const { data } = await api.post<DriveDocument>('/drive/documents', { url }, { signal });
    return data;
  },
  async getDriveChanges(filters: RecordFilters = {}, signal?: AbortSignal) {
    try {
      const { data } = await api.get<PaginatedResponse<DriveChange>>('/drive/changes', { params: filters, signal });
      return data;
    } catch {
      return emptyPage<DriveChange>(Number(filters.pageSize || 50));
    }
  },
  async getFinanceSummary(signal?: AbortSignal) {
    try {
      const { data } = await api.get<FinanceSummary>('/finance/summary', { signal });
      return data;
    } catch {
      return {} satisfies FinanceSummary;
    }
  },
  async getFinanceRecords(type: 'incomes' | 'expenses' | 'purchases', filters: RecordFilters = {}, signal?: AbortSignal) {
    try {
      const { data } = await api.get<PaginatedResponse<FinancialRecord>>(`/finance/${type}`, { params: filters, signal });
      return data;
    } catch {
      return emptyPage<FinancialRecord>(Number(filters.pageSize || 50));
    }
  },
  async getCategories(filters: RecordFilters = {}, signal?: AbortSignal) {
    try {
      const { data } = await api.get<FinanceGroup[]>('/finance/categories', { params: filters, signal });
      return data;
    } catch {
      return [];
    }
  },
  async getProviders(signal?: AbortSignal) {
    try {
      const { data } = await api.get<FinanceGroup[]>('/finance/providers', { signal });
      return data;
    } catch {
      return [];
    }
  },
  async getComparison(filters: RecordFilters = {}, signal?: AbortSignal) {
    try {
      const { data } = await api.get<FinanceComparison>('/finance/comparison', { params: filters, signal });
      return data;
    } catch {
      return {} satisfies FinanceComparison;
    }
  },
  async getNotifications(signal?: AbortSignal) {
    try {
      const { data } = await api.get<EnterpriseNotification[] | PaginatedResponse<EnterpriseNotification>>('/notifications/enterprise', { signal });
      return unwrapRows(data);
    } catch {
      return [];
    }
  },
  async getEnterpriseNotifications(signal?: AbortSignal) {
    try {
      const { data } = await api.get<EnterpriseNotification[]>('/notifications', { signal });
      return data;
    } catch {
      return [];
    }
  },
  async markNotificationRead(id: string, signal?: AbortSignal) {
    const { data } = await api.patch<EnterpriseNotification>(`/notifications/enterprise/${id}/read`, {}, { signal });
    return data;
  },
  async getReports(signal?: AbortSignal) {
    try {
      const { data } = await api.get<EnterpriseReport[]>('/reports', { signal });
      return data;
    } catch {
      return [];
    }
  },
  async generateReport(type: 'daily' | 'weekly' | 'monthly' | 'custom', signal?: AbortSignal) {
    const { data } = await api.post<EnterpriseReport>('/reports/generate', { type }, { signal });
    return data;
  },
  reportDownloadUrl(id: string, format = 'json') {
    return `/reports/${id}/download?format=${encodeURIComponent(format)}`;
  },
};
