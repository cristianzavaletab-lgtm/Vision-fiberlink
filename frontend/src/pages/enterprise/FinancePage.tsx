import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Banknote, Calculator, ShoppingCart, TrendingDown, TrendingUp } from 'lucide-react';
import { CategoryChart, IncomeExpenseChart } from '../../components/enterprise/EnterpriseCharts';
import { EmptyState, LoadingState, MetricCard, PageHeader, SelectInput } from '../../components/enterprise/EnterpriseUI';
import { dateRangeForPeriod, enterpriseApi, formatMoney, numberValue } from '../../services/enterpriseApi';
import type { FinancialRecord, FinanceComparison, FinanceGroup, FinanceSummary, PeriodKey } from '../../services/enterpriseApi';

function groupByDate(records: FinancialRecord[], key: 'income' | 'expense') {
  const map = new Map<string, { label: string; income: number; expense: number }>();
  records.forEach((record) => {
    if (!record.date) return;
    const label = new Date(record.date).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
    const item = map.get(label) || { label, income: 0, expense: 0 };
    item[key] += numberValue(record.amount);
    map.set(label, item);
  });
  return Array.from(map.values()).slice(-30);
}

export function FinancePage() {
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [comparison, setComparison] = useState<FinanceComparison | null>(null);
  const [incomes, setIncomes] = useState<FinancialRecord[]>([]);
  const [expenses, setExpenses] = useState<FinancialRecord[]>([]);
  const [categories, setCategories] = useState<FinanceGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback((signal?: AbortSignal) => {
    const range = dateRangeForPeriod(period);
    return Promise.all([
      enterpriseApi.getFinanceSummary(signal),
      enterpriseApi.getComparison(range, signal),
      enterpriseApi.getFinanceRecords('incomes', { ...range, pageSize: 200 }, signal),
      enterpriseApi.getFinanceRecords('expenses', { ...range, pageSize: 200 }, signal),
      enterpriseApi.getCategories(signal),
    ]).then(([nextSummary, nextComparison, incomeRows, expenseRows, categoryRows]) => {
      setSummary(nextSummary);
      setComparison(nextComparison);
      setIncomes(incomeRows.rows);
      setExpenses(expenseRows.rows);
      setCategories(categoryRows);
    }).finally(() => setLoading(false));
  }, [period]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const chartData = useMemo(() => {
    const incomeByDate = groupByDate(incomes, 'income');
    const expenseByDate = groupByDate(expenses, 'expense');
    const map = new Map(incomeByDate.map((item) => [item.label, item]));
    expenseByDate.forEach((item) => map.set(item.label, { ...(map.get(item.label) || { label: item.label, income: 0, expense: 0 }), expense: item.expense }));
    return Array.from(map.values());
  }, [incomes, expenses]);
  const movementCount = incomes.length + expenses.length;
  const periodIncome = incomes.reduce((sum, record) => sum + numberValue(record.amount), 0);
  const periodExpense = expenses.reduce((sum, record) => sum + numberValue(record.amount), 0);
  const margin = periodIncome > 0 ? ((periodIncome - periodExpense) / periodIncome) * 100 : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Control financiero" description="Indicadores financieros del periodo actual y comparación contra el periodo anterior.">
        <SelectInput value={period} onChange={(value) => setPeriod(value as PeriodKey)} options={[{ value: 'today', label: 'Hoy' }, { value: 'week', label: 'Esta semana' }, { value: 'month', label: 'Este mes' }, { value: 'previous-month', label: 'Mes anterior' }, { value: 'year', label: 'Este año' }]} />
      </PageHeader>
      {loading ? <LoadingState /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard title="Ingresos del periodo" value={formatMoney(periodIncome || summary?.month?.income)} helper={comparison?.comparable && comparison.variation !== null ? `${comparison.variation?.toFixed(1)}% frente al periodo anterior` : 'Sin comparación suficiente'} icon={TrendingUp} tone="green" empty={!periodIncome && !numberValue(summary?.month?.income)} />
            <MetricCard title="Egresos del periodo" value={formatMoney(periodExpense || summary?.month?.expense)} helper={`${expenses.length || summary?.month?.expenseCount || 0} gastos procesados`} icon={TrendingDown} tone="red" empty={!periodExpense && !numberValue(summary?.month?.expense)} />
            <MetricCard title="Saldo neto" value={formatMoney(periodIncome - periodExpense || summary?.month?.net)} helper="Ingresos menos egresos" icon={Banknote} tone={(periodIncome - periodExpense) >= 0 ? 'teal' : 'red'} empty={!movementCount} />
            <MetricCard title="Margen" value={margin === null ? 'Sin datos' : `${margin.toFixed(1)}%`} helper="Saldo neto sobre ingresos" icon={Calculator} tone="blue" empty={margin === null} />
            <MetricCard title="Compras pendientes" value={formatMoney(summary?.purchases?.committed)} helper={`${summary?.purchases?.pendingCount || 0} compras`} icon={ShoppingCart} tone="amber" empty={!summary?.purchases?.pendingCount} />
            <MetricCard title="Movimientos" value={`${movementCount}`} helper="Ingresos y egresos del periodo" icon={Activity} tone="slate" empty={!movementCount} />
            <MetricCard title="Promedio de ingresos" value={formatMoney(incomes.length ? periodIncome / incomes.length : summary?.month?.averageIncome)} helper={`${incomes.length} registros`} icon={TrendingUp} tone="green" empty={!incomes.length} />
            <MetricCard title="Promedio de egresos" value={formatMoney(expenses.length ? periodExpense / expenses.length : summary?.month?.averageExpense)} helper={`${expenses.length} registros`} icon={TrendingDown} tone="red" empty={!expenses.length} />
            <MetricCard title="Mayor ingreso" value={formatMoney(Math.max(0, ...incomes.map((record) => numberValue(record.amount))) || summary?.month?.highestIncome)} helper="Registro más alto" icon={TrendingUp} tone="green" empty={!incomes.length && !numberValue(summary?.month?.highestIncome)} />
            <MetricCard title="Mayor gasto" value={formatMoney(Math.max(0, ...expenses.map((record) => numberValue(record.amount))) || summary?.month?.highestExpense)} helper="Egreso más alto" icon={TrendingDown} tone="red" empty={!expenses.length && !numberValue(summary?.month?.highestExpense)} />
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <IncomeExpenseChart data={chartData} />
            <CategoryChart data={categories.map((item) => ({ name: item.name, value: numberValue(item.expense) }))} />
          </div>
          {!movementCount && <EmptyState icon={Banknote} title="Aún no hay movimientos procesados" description="Sin ingresos ni egresos reales para este periodo. Ejecuta una sincronización de Drive o ajusta el periodo." />}
        </>
      )}
    </div>
  );
}
