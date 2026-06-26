import { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Monitor,
  Calendar,
  ChevronDown,
  Target,
  Zap,
  Clock,
  BarChart3,
  Laptop,
  Gauge,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from 'recharts';
import { api } from '../services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AppUsageEntry {
  app: string;
  seconds: number;
}

interface ProductivityData {
  score: number;
  label: string;
  productiveSeconds: number;
  unproductiveSeconds: number;
  neutralSeconds: number;
  categoryBreakdown: Array<{ name: string; seconds: number; color: string }>;
  topProductive: Array<{ app: string; seconds: number }>;
  topUnproductive: Array<{ app: string; seconds: number }>;
}

interface DailyReportResponse {
  appUsage: AppUsageEntry[];
  hourlyBreakdown: Array<{ hour: number; apps: Record<string, number>; totalSeconds: number }>;
  productivity?: ProductivityData;
  summary: {
    totalApps: number;
    totalActiveSeconds: number;
    totalSessions: number;
    mostUsedApp: string;
    productivityScore?: number;
    productivityLabel?: string;
  };
}

interface DeviceEntry {
  id: string;
  name: string;
  os?: string;
  status?: string;
}

type DateRange = 'today' | 'week' | 'month';

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

function formatSeconds(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function getDateRange(range: DateRange): string[] {
  const dates: string[] = [];
  const now = new Date();
  const days = range === 'today' ? 1 : range === 'week' ? 7 : 30;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

const CHART_COLORS = ['#FF6B35', '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899'];
const PIE_COLORS: Record<string, string> = {
  Development: '#FF6B35',
  Communication: '#3B82F6',
  Entertainment: '#EF4444',
  Browsing: '#F59E0B',
  Office: '#10B981',
  Design: '#8B5CF6',
  'Social Media': '#EC4899',
  Other: '#6B7280',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProductivityView() {
  const [dateRange, setDateRange] = useState<DateRange>('week');
  const [deviceFilter, setDeviceFilter] = useState<string>('');
  const [devices, setDevices] = useState<DeviceEntry[]>([]);
  const [dailyData, setDailyData] = useState<Record<string, DailyReportResponse>>({});
  const [loading, setLoading] = useState(true);
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const [showDeviceDropdown, setShowDeviceDropdown] = useState(false);

  // Fetch devices
  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const res = await api.get('/devices');
        setDevices(res.data.map((d: any) => ({ id: d.id, name: d.name, os: d.os, status: d.status })));
      } catch {
        // silent
      }
    };
    fetchDevices();
  }, []);

  // Fetch daily reports for date range
  useEffect(() => {
    const fetchReports = async () => {
      setLoading(true);
      try {
        const dates = getDateRange(dateRange);
        const results: Record<string, DailyReportResponse> = {};

        const requests = dates.map(async (date) => {
          const params = new URLSearchParams({ date });
          if (deviceFilter) params.set('deviceId', deviceFilter);
          try {
            const res = await api.get(`/reports/daily?${params.toString()}`);
            results[date] = res.data;
          } catch {
            // Day with no data
          }
        });

        await Promise.all(requests);
        setDailyData(results);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };
    fetchReports();
  }, [dateRange, deviceFilter]);

  // ---------------------------------------------------------------------------
  // Computed Data — uses backend productivity engine
  // ---------------------------------------------------------------------------

  const totalProductive = useMemo(() => {
    return Object.values(dailyData).reduce((sum, report) => sum + (report.productivity?.productiveSeconds || 0), 0);
  }, [dailyData]);

  const totalUnproductive = useMemo(() => {
    return Object.values(dailyData).reduce((sum, report) => sum + (report.productivity?.unproductiveSeconds || 0), 0);
  }, [dailyData]);

  const totalNeutral = useMemo(() => {
    return Object.values(dailyData).reduce((sum, report) => sum + (report.productivity?.neutralSeconds || 0), 0);
  }, [dailyData]);

  const productivityScore = useMemo(() => {
    const denominator = totalProductive + totalUnproductive;
    if (denominator === 0) return 0;
    return Math.round((totalProductive / denominator) * 100);
  }, [totalProductive, totalUnproductive]);

  // Merge top productive apps from all reports
  const productiveApps = useMemo(() => {
    const appMap: Record<string, number> = {};
    Object.values(dailyData).forEach((report) => {
      report.productivity?.topProductive?.forEach((entry) => {
        appMap[entry.app] = (appMap[entry.app] || 0) + entry.seconds;
      });
    });
    return Object.entries(appMap)
      .map(([app, seconds]) => ({ app, seconds }))
      .sort((a, b) => b.seconds - a.seconds);
  }, [dailyData]);

  // Merge top unproductive apps from all reports
  const unproductiveApps = useMemo(() => {
    const appMap: Record<string, number> = {};
    Object.values(dailyData).forEach((report) => {
      report.productivity?.topUnproductive?.forEach((entry) => {
        appMap[entry.app] = (appMap[entry.app] || 0) + entry.seconds;
      });
    });
    return Object.entries(appMap)
      .map(([app, seconds]) => ({ app, seconds }))
      .sort((a, b) => b.seconds - a.seconds);
  }, [dailyData]);

  // Area chart data: productive vs unproductive per day
  const timelineData = useMemo(() => {
    const dates = getDateRange(dateRange);
    return dates.map((date) => {
      const report = dailyData[date];
      const prodSec = report?.productivity?.productiveSeconds || 0;
      const unprodSec = report?.productivity?.unproductiveSeconds || 0;
      const label = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      return {
        date: label,
        productive: parseFloat((prodSec / 3600).toFixed(2)),
        unproductive: parseFloat((unprodSec / 3600).toFixed(2)),
      };
    });
  }, [dailyData, dateRange]);

  // Category breakdown for PieChart — merge from all reports
  const categoryBreakdown = useMemo(() => {
    const categories: Record<string, { seconds: number; color: string }> = {};
    Object.values(dailyData).forEach((report) => {
      report.productivity?.categoryBreakdown?.forEach((cat) => {
        if (!categories[cat.name]) {
          categories[cat.name] = { seconds: 0, color: cat.color };
        }
        categories[cat.name].seconds += cat.seconds;
      });
    });
    return Object.entries(categories)
      .map(([name, { seconds, color }]) => ({ name, value: seconds, color }))
      .sort((a, b) => b.value - a.value);
  }, [dailyData]);

  // Per-device productivity — uses backend scores when available
  const deviceProductivity = useMemo(() => {
    if (deviceFilter) return []; // No breakdown when filtering by single device
    const deviceMap: Record<string, { prodSec: number; unprodSec: number; totalSec: number; name: string }> = {};

    devices.forEach((d) => {
      deviceMap[d.id] = { prodSec: 0, unprodSec: 0, totalSec: 0, name: d.name };
    });

    // Distribute productivity data proportionally across devices
    Object.values(dailyData).forEach((report) => {
      const prod = report.productivity;
      if (!prod) return;
      devices.forEach((d) => {
        if (!deviceMap[d.id]) deviceMap[d.id] = { prodSec: 0, unprodSec: 0, totalSec: 0, name: d.name };
        deviceMap[d.id].prodSec += prod.productiveSeconds / devices.length;
        deviceMap[d.id].unprodSec += prod.unproductiveSeconds / devices.length;
        deviceMap[d.id].totalSec += (prod.productiveSeconds + prod.unproductiveSeconds + prod.neutralSeconds) / devices.length;
      });
    });

    return Object.entries(deviceMap)
      .map(([id, data]) => {
        const denom = data.prodSec + data.unprodSec;
        const score = denom > 0 ? Math.round((data.prodSec / denom) * 100) : 0;
        return { id, name: data.name, score, totalHours: parseFloat((data.totalSec / 3600).toFixed(1)) };
      })
      .sort((a, b) => b.score - a.score);
  }, [dailyData, devices, deviceFilter]);

  // ---------------------------------------------------------------------------
  // Tooltip
  // ---------------------------------------------------------------------------

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-surface-elevated border border-surface-border rounded-lg px-3 py-2 shadow-xl">
          <p className="text-[10px] text-text-tertiary font-mono mb-1">{label}</p>
          {payload.map((entry: any, i: number) => (
            <p key={i} className="text-xs font-semibold" style={{ color: entry.color }}>
              {entry.name}: {entry.value}h
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const PieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-surface-elevated border border-surface-border rounded-lg px-3 py-2 shadow-xl">
          <p className="text-xs font-semibold text-text-primary">{payload[0].name}</p>
          <p className="text-[10px] text-text-secondary">{formatSeconds(payload[0].value)}</p>
        </div>
      );
    }
    return null;
  };

  // ---------------------------------------------------------------------------
  // Score color helpers
  // ---------------------------------------------------------------------------

  function getScoreColor(score: number): string {
    if (score >= 75) return 'text-status-success';
    if (score >= 50) return 'text-status-warning';
    return 'text-status-error';
  }

  function getScoreStrokeColor(score: number): string {
    if (score >= 75) return '#10B981';
    if (score >= 50) return '#F59E0B';
    return '#EF4444';
  }

  function getScoreBg(score: number): string {
    if (score >= 75) return 'bg-status-success/10';
    if (score >= 50) return 'bg-status-warning/10';
    return 'bg-status-error/10';
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const dateRangeLabels: Record<DateRange, string> = {
    today: 'Today',
    week: 'This Week',
    month: 'This Month',
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8 animate-slide-up max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 stagger-1">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-1.5 rounded-full bg-brand shadow-[0_0_8px_rgba(255,107,53,0.6)]" />
            <h3 className="text-brand font-bold text-[11px] tracking-[0.2em] uppercase">Productivity</h3>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-text-primary tracking-tight">Productivity Analytics</h1>
          <p className="text-sm md:text-base text-text-secondary mt-1 flex items-center gap-2">
            <Target className="w-4 h-4 text-brand" />
            Workforce performance insights and application usage analysis
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Date Range Selector */}
          <div className="relative">
            <button
              onClick={() => { setShowDateDropdown(!showDateDropdown); setShowDeviceDropdown(false); }}
              className="flex items-center gap-2 bg-surface-elevated/50 border border-surface-border rounded-xl px-4 py-2 text-sm font-semibold text-text-secondary hover:border-brand/30 transition-all duration-300"
            >
              <Calendar className="w-4 h-4 text-brand" />
              {dateRangeLabels[dateRange]}
              <ChevronDown className="w-3.5 h-3.5 text-text-tertiary" />
            </button>
            {showDateDropdown && (
              <div className="absolute right-0 top-full mt-2 bg-surface-elevated border border-surface-border rounded-xl shadow-2xl z-50 overflow-hidden min-w-[160px]">
                {(Object.entries(dateRangeLabels) as [DateRange, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => { setDateRange(key); setShowDateDropdown(false); }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                      dateRange === key ? 'bg-brand/10 text-brand font-semibold' : 'text-text-secondary hover:bg-surface-base'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Device Filter */}
          <div className="relative">
            <button
              onClick={() => { setShowDeviceDropdown(!showDeviceDropdown); setShowDateDropdown(false); }}
              className="flex items-center gap-2 bg-surface-elevated/50 border border-surface-border rounded-xl px-4 py-2 text-sm font-semibold text-text-secondary hover:border-brand/30 transition-all duration-300"
            >
              <Laptop className="w-4 h-4 text-brand" />
              {deviceFilter ? devices.find((d) => d.id === deviceFilter)?.name || 'Device' : 'All Devices'}
              <ChevronDown className="w-3.5 h-3.5 text-text-tertiary" />
            </button>
            {showDeviceDropdown && (
              <div className="absolute right-0 top-full mt-2 bg-surface-elevated border border-surface-border rounded-xl shadow-2xl z-50 overflow-hidden min-w-[180px] max-h-[240px] overflow-y-auto custom-scrollbar">
                <button
                  onClick={() => { setDeviceFilter(''); setShowDeviceDropdown(false); }}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                    !deviceFilter ? 'bg-brand/10 text-brand font-semibold' : 'text-text-secondary hover:bg-surface-base'
                  }`}
                >
                  All Devices
                </button>
                {devices.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => { setDeviceFilter(d.id); setShowDeviceDropdown(false); }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                      deviceFilter === d.id ? 'bg-brand/10 text-brand font-semibold' : 'text-text-secondary hover:bg-surface-base'
                    }`}
                  >
                    {d.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
            <p className="text-sm text-text-tertiary">Loading productivity data...</p>
          </div>
        </div>
      )}

      {!loading && (
        <>
          {/* Top Row: Score + Summary Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-5 md:gap-6 stagger-2">
            {/* Productivity Score - Circular Gauge */}
            <div className="glass-subtle rounded-2xl p-6 border border-surface-border flex flex-col items-center justify-center">
              <h2 className="text-sm font-bold text-text-secondary mb-4 flex items-center gap-2">
                <Gauge className="w-4 h-4 text-brand" />
                Productivity Score
              </h2>
              <div className="relative w-36 h-36">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 120 120">
                  {/* Background circle */}
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="10"
                    className="text-surface-border"
                  />
                  {/* Progress arc */}
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    fill="none"
                    stroke={getScoreStrokeColor(productivityScore)}
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${(productivityScore / 100) * 326.73} 326.73`}
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-3xl font-black ${getScoreColor(productivityScore)}`}>
                    {productivityScore}%
                  </span>
                  <span className="text-[10px] text-text-tertiary font-medium mt-0.5">Overall</span>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-1.5">
                {productivityScore >= 75 ? (
                  <ArrowUpRight className="w-3.5 h-3.5 text-status-success" />
                ) : productivityScore >= 50 ? (
                  <Minus className="w-3.5 h-3.5 text-status-warning" />
                ) : (
                  <ArrowDownRight className="w-3.5 h-3.5 text-status-error" />
                )}
                <span className={`text-xs font-semibold ${getScoreColor(productivityScore)}`}>
                  {productivityScore >= 75 ? 'Excellent' : productivityScore >= 50 ? 'Average' : 'Needs Improvement'}
                </span>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Productive Time */}
              <div className="glass-subtle rounded-2xl p-5 border border-surface-border hover-card transition-all duration-300 hover:border-status-success/30 group">
                <div className="flex justify-between items-start mb-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-status-success/10 transition-transform duration-300 group-hover:scale-110">
                    <TrendingUp className="w-5 h-5 text-status-success" />
                  </div>
                  <div className="flex items-center gap-0.5 bg-status-success/10 text-status-success px-1.5 py-0.5 rounded-md">
                    <ArrowUpRight className="w-3 h-3" />
                    <span className="text-[9px] font-bold">PROD</span>
                  </div>
                </div>
                <p className="text-2xl md:text-3xl font-black text-text-primary tracking-tight">{formatSeconds(totalProductive)}</p>
                <p className="text-sm font-semibold text-text-secondary mt-1">Productive Time</p>
                <p className="text-[11px] text-text-tertiary mt-0.5">Focused work applications</p>
              </div>

              {/* Unproductive Time */}
              <div className="glass-subtle rounded-2xl p-5 border border-surface-border hover-card transition-all duration-300 hover:border-status-error/30 group">
                <div className="flex justify-between items-start mb-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-status-error/10 transition-transform duration-300 group-hover:scale-110">
                    <TrendingDown className="w-5 h-5 text-status-error" />
                  </div>
                  <div className="flex items-center gap-0.5 bg-status-error/10 text-status-error px-1.5 py-0.5 rounded-md">
                    <ArrowDownRight className="w-3 h-3" />
                    <span className="text-[9px] font-bold">DIST</span>
                  </div>
                </div>
                <p className="text-2xl md:text-3xl font-black text-text-primary tracking-tight">{formatSeconds(totalUnproductive)}</p>
                <p className="text-sm font-semibold text-text-secondary mt-1">Unproductive Time</p>
                <p className="text-[11px] text-text-tertiary mt-0.5">Entertainment and social media</p>
              </div>

              {/* Neutral Time */}
              <div className="glass-subtle rounded-2xl p-5 border border-surface-border hover-card transition-all duration-300 hover:border-blue-500/30 group">
                <div className="flex justify-between items-start mb-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-500/10 transition-transform duration-300 group-hover:scale-110">
                    <Clock className="w-5 h-5 text-blue-400" />
                  </div>
                  <div className="flex items-center gap-0.5 bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded-md">
                    <Minus className="w-3 h-3" />
                    <span className="text-[9px] font-bold">NEU</span>
                  </div>
                </div>
                <p className="text-2xl md:text-3xl font-black text-text-primary tracking-tight">{formatSeconds(totalNeutral)}</p>
                <p className="text-sm font-semibold text-text-secondary mt-1">Neutral Time</p>
                <p className="text-[11px] text-text-tertiary mt-0.5">Browsers and file managers</p>
              </div>
            </div>
          </div>

          {/* Charts Row: Time Trend + Category Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 md:gap-6 stagger-3">
            {/* Productive vs Unproductive AreaChart */}
            <div className="lg:col-span-2 glass-subtle rounded-2xl p-5 md:p-6 border border-surface-border">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-brand" />
                  Productive vs Unproductive Time
                </h2>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Productive</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-500" /> Unproductive</span>
                </div>
              </div>
              <div className="h-[220px] md:h-[260px]">
                {timelineData.some((d) => d.productive > 0 || d.unproductive > 0) ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={timelineData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                      <defs>
                        <linearGradient id="prodGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="unprodGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#71717A' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: '#71717A' }} axisLine={false} tickLine={false} unit="h" />
                      <Tooltip content={<CustomTooltip />} />
                      <Area type="monotone" dataKey="productive" name="Productive" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#prodGradient)" dot={false} />
                      <Area type="monotone" dataKey="unproductive" name="Unproductive" stroke="#EF4444" strokeWidth={2} fillOpacity={1} fill="url(#unprodGradient)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-text-tertiary">
                    <BarChart3 className="w-10 h-10 mb-2 opacity-30" />
                    <p className="text-xs">No productivity data available for this period</p>
                    <p className="text-[10px] mt-1 text-text-tertiary/60">Data will appear once activity is recorded</p>
                  </div>
                )}
              </div>
            </div>

            {/* Category Breakdown PieChart */}
            <div className="glass-subtle rounded-2xl p-5 md:p-6 border border-surface-border">
              <h2 className="text-base font-bold text-text-primary flex items-center gap-2 mb-4">
                <Zap className="w-4 h-4 text-brand" />
                Category Breakdown
              </h2>
              {categoryBreakdown.length > 0 ? (
                <div className="flex flex-col items-center">
                  <div className="h-[160px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryBreakdown}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={65}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {categoryBreakdown.map((entry, i) => (
                            <Cell key={i} fill={entry.color || PIE_COLORS[entry.name] || CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<PieTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3 w-full">
                    {categoryBreakdown.map((cat, i) => (
                      <div key={cat.name} className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: cat.color || PIE_COLORS[cat.name] || CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="text-[11px] text-text-secondary truncate">{cat.name}</span>
                        <span className="text-[9px] text-text-tertiary ml-auto font-mono shrink-0">{formatSeconds(cat.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-[200px] flex flex-col items-center justify-center text-text-tertiary">
                  <Zap className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-xs">No category data available</p>
                </div>
              )}
            </div>
          </div>

          {/* App Lists Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 md:gap-6 stagger-4">
            {/* Top Productive Apps */}
            <div className="glass-subtle rounded-2xl p-5 md:p-6 border border-surface-border">
              <h2 className="text-base font-bold text-text-primary flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-status-success" />
                Top Productive Applications
              </h2>
              {productiveApps.length > 0 ? (
                <div className="space-y-3">
                  {productiveApps.slice(0, 8).map((app, i) => {
                    const maxSec = productiveApps[0]?.seconds || 1;
                    const percentage = Math.round((app.seconds / maxSec) * 100);
                    return (
                      <div key={app.app} className="group">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] font-mono text-text-tertiary w-4 text-right">{i + 1}</span>
                            <span className="text-sm font-semibold text-text-primary truncate">{app.app}</span>
                          </div>
                          <span className="text-xs font-mono text-text-secondary shrink-0 ml-2">{formatSeconds(app.seconds)}</span>
                        </div>
                        <div className="w-full bg-surface-base rounded-full h-1.5 ml-6">
                          <div
                            className="h-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-text-tertiary">
                  <TrendingUp className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-xs">No productive app usage recorded</p>
                </div>
              )}
            </div>

            {/* Top Unproductive Apps */}
            <div className="glass-subtle rounded-2xl p-5 md:p-6 border border-surface-border">
              <h2 className="text-base font-bold text-text-primary flex items-center gap-2 mb-4">
                <TrendingDown className="w-4 h-4 text-status-error" />
                Top Unproductive Applications
              </h2>
              {unproductiveApps.length > 0 ? (
                <div className="space-y-3">
                  {unproductiveApps.slice(0, 8).map((app, i) => {
                    const maxSec = unproductiveApps[0]?.seconds || 1;
                    const percentage = Math.round((app.seconds / maxSec) * 100);
                    return (
                      <div key={app.app} className="group">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] font-mono text-text-tertiary w-4 text-right">{i + 1}</span>
                            <span className="text-sm font-semibold text-text-primary truncate">{app.app}</span>
                          </div>
                          <span className="text-xs font-mono text-text-secondary shrink-0 ml-2">{formatSeconds(app.seconds)}</span>
                        </div>
                        <div className="w-full bg-surface-base rounded-full h-1.5 ml-6">
                          <div
                            className="h-1.5 rounded-full bg-gradient-to-r from-red-500 to-red-400 transition-all duration-700"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-text-tertiary">
                  <TrendingDown className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-xs">No unproductive app usage recorded</p>
                </div>
              )}
            </div>
          </div>

          {/* Per-Device Productivity Ranking */}
          {!deviceFilter && deviceProductivity.length > 0 && (
            <div className="glass-subtle rounded-2xl p-5 md:p-6 border border-surface-border stagger-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-brand" />
                  Per-Device Productivity Ranking
                </h2>
                <span className="text-[10px] text-text-tertiary font-mono">{deviceProductivity.length} devices</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-surface-border">
                      <th className="text-left text-[10px] font-bold text-text-tertiary uppercase tracking-wider pb-3 pr-4">Rank</th>
                      <th className="text-left text-[10px] font-bold text-text-tertiary uppercase tracking-wider pb-3 pr-4">Device</th>
                      <th className="text-left text-[10px] font-bold text-text-tertiary uppercase tracking-wider pb-3 pr-4">Score</th>
                      <th className="text-left text-[10px] font-bold text-text-tertiary uppercase tracking-wider pb-3 pr-4">Total Hours</th>
                      <th className="text-left text-[10px] font-bold text-text-tertiary uppercase tracking-wider pb-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deviceProductivity.map((device, i) => (
                      <tr key={device.id} className="border-b border-surface-border/50 hover:bg-surface-elevated/30 transition-colors">
                        <td className="py-3 pr-4">
                          <span className={`text-xs font-bold ${i === 0 ? 'text-brand' : 'text-text-tertiary'}`}>#{i + 1}</span>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <Laptop className="w-3.5 h-3.5 text-text-tertiary" />
                            <span className="text-sm font-semibold text-text-primary">{device.name}</span>
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-surface-base rounded-full h-1.5">
                              <div
                                className={`h-1.5 rounded-full transition-all duration-700 ${
                                  device.score >= 75 ? 'bg-status-success' : device.score >= 50 ? 'bg-status-warning' : 'bg-status-error'
                                }`}
                                style={{ width: `${device.score}%` }}
                              />
                            </div>
                            <span className={`text-xs font-bold font-mono ${getScoreColor(device.score)}`}>{device.score}%</span>
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <span className="text-xs font-mono text-text-secondary">{device.totalHours}h</span>
                        </td>
                        <td className="py-3">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${getScoreBg(device.score)} ${getScoreColor(device.score)}`}>
                            {device.score >= 75 ? 'High' : device.score >= 50 ? 'Medium' : 'Low'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
