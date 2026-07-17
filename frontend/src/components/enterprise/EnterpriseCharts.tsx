import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3 } from 'lucide-react';
import { EmptyState, SectionCard } from './EnterpriseUI';
import { formatMoney } from '../../services/enterpriseApi';

export interface TrendPoint {
  label: string;
  income?: number;
  expense?: number;
  balance?: number;
}

export interface PiePoint {
  name: string;
  value: number;
}

const COLORS = ['#2563EB', '#0F766E', '#16A34A', '#F59E0B', '#DC2626', '#64748B', '#7C3AED'];

function MoneyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-sm shadow-lg">
      <p className="mb-1 font-semibold text-[#0F172A]">{label}</p>
      {payload.map((item: any) => <p key={item.name} style={{ color: item.color }} className="font-medium">{item.name}: {formatMoney(item.value)}</p>)}
    </div>
  );
}

export function IncomeExpenseChart({ data, title = 'Evolución de ingresos y egresos' }: { data: TrendPoint[]; title?: string }) {
  const hasData = data.some((item) => Number(item.income || 0) > 0 || Number(item.expense || 0) > 0);
  return (
    <SectionCard className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[#0F172A]">{title}</h2>
          <p className="text-sm text-[#64748B]">Datos reales agrupados desde registros financieros procesados.</p>
        </div>
      </div>
      <div className="h-72">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#E2E8F0" strokeDasharray="4 4" />
              <XAxis dataKey="label" tick={{ fill: '#64748B', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#64748B', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(value) => `S/${Number(value).toLocaleString('es-PE')}`} />
              <Tooltip content={<MoneyTooltip />} />
              <Line type="monotone" dataKey="income" stroke="#16A34A" strokeWidth={3} name="Ingresos" dot={false} />
              <Line type="monotone" dataKey="expense" stroke="#DC2626" strokeWidth={3} name="Egresos" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : <EmptyState icon={BarChart3} title="Aún no hay movimientos procesados" description="La evolución aparecerá cuando existan ingresos o egresos sincronizados desde Google Sheets." />}
      </div>
    </SectionCard>
  );
}

export function CategoryChart({ data, title = 'Egresos por categoría' }: { data: PiePoint[]; title?: string }) {
  const visible = data.filter((item) => item.value > 0).slice(0, 8);
  return (
    <SectionCard className="p-5">
      <h2 className="text-base font-semibold text-[#0F172A]">{title}</h2>
      <p className="text-sm text-[#64748B]">Clasificación calculada desde registros financieros reales.</p>
      <div className="mt-4 h-72">
        {visible.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={visible} dataKey="value" nameKey="name" innerRadius={62} outerRadius={96} paddingAngle={2}>
                {visible.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
              </Pie>
              <Tooltip content={<MoneyTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        ) : <EmptyState icon={BarChart3} title="Sin egresos categorizados" description="No se encontraron categorías de gasto para el periodo actual." />}
      </div>
      {visible.length > 0 && <div className="mt-4 grid gap-2 sm:grid-cols-2">{visible.map((item, index) => <div key={item.name} className="flex items-center justify-between gap-3 rounded-xl bg-[#F8FAFC] px-3 py-2 text-sm"><span className="flex items-center gap-2 truncate text-[#475569]"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />{item.name}</span><span className="font-semibold text-[#0F172A]">{formatMoney(item.value)}</span></div>)}</div>}
    </SectionCard>
  );
}

export function DocumentsStatusChart({ data }: { data: PiePoint[] }) {
  const visible = data.filter((item) => item.value > 0);
  return (
    <SectionCard className="p-5">
      <h2 className="text-base font-semibold text-[#0F172A]">Documentos procesados</h2>
      <p className="text-sm text-[#64748B]">Estado operativo de los documentos sincronizados.</p>
      <div className="mt-4 h-64">
        {visible.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={visible} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#E2E8F0" strokeDasharray="4 4" />
              <XAxis dataKey="name" tick={{ fill: '#64748B', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: '#64748B', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Bar dataKey="value" name="Documentos" fill="#2563EB" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : <EmptyState icon={BarChart3} title="Sin documentos procesados" description="Ejecuta una sincronización para ver el estado documental." />}
      </div>
    </SectionCard>
  );
}

export function MonthlyResultChart({ data }: { data: TrendPoint[] }) {
  const hasData = data.some((item) => Number(item.income || 0) > 0 || Number(item.expense || 0) > 0 || Number(item.balance || 0) !== 0);
  return (
    <SectionCard className="p-5">
      <h2 className="text-base font-semibold text-[#0F172A]">Resultado financiero mensual</h2>
      <p className="text-sm text-[#64748B]">Ingresos, egresos y saldo neto por periodo.</p>
      <div className="mt-4 h-64">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#E2E8F0" strokeDasharray="4 4" />
              <XAxis dataKey="label" tick={{ fill: '#64748B', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#64748B', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(value) => `S/${Number(value).toLocaleString('es-PE')}`} />
              <Tooltip content={<MoneyTooltip />} />
              <Bar dataKey="income" name="Ingresos" fill="#16A34A" radius={[8, 8, 0, 0]} />
              <Bar dataKey="expense" name="Egresos" fill="#DC2626" radius={[8, 8, 0, 0]} />
              <Bar dataKey="balance" name="Saldo" fill="#2563EB" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : <EmptyState icon={BarChart3} title="Sin resultado financiero" description="No hay suficientes registros para calcular el resultado mensual." />}
      </div>
    </SectionCard>
  );
}
