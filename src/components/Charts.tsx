import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoney } from '@shared/money';

const gbp = (n: number) => formatMoney({ amount: n, currency: 'GBP' });
const axis = { fontSize: 11, fill: '#737373' };

export function SalesChart<T extends { date: string }>({ data, dataKey, label, money = false }: { data: T[]; dataKey: keyof T & string; label: string; money?: boolean }) {
  return (
    <figure>
      <figcaption className="sr-only">{label}</figcaption>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id={`g-${dataKey}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#B5122B" stopOpacity={0.16} />
                <stop offset="1" stopColor="#B5122B" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#E7E5E4" vertical={false} />
            <XAxis dataKey="date" tick={axis} tickLine={false} axisLine={false} tickFormatter={(d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} minTickGap={32} />
            <YAxis tick={axis} tickLine={false} axisLine={false} width={money ? 64 : 32} tickFormatter={(v: number) => (money ? gbp(v).replace('.00', '') : String(v))} />
            <Tooltip formatter={(v: number) => (money ? gbp(v) : v)} labelFormatter={(d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })} contentStyle={{ border: '1px solid #E7E5E4', borderRadius: 0, fontSize: 12 }} />
            <Area type="monotone" dataKey={dataKey} stroke="#B5122B" strokeWidth={2} fill={`url(#g-${dataKey})`} isAnimationActive={!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function BarsChart({ data, label, money = false }: { data: { name: string; value: number }[]; label: string; money?: boolean }) {
  return (
    <figure>
      <figcaption className="sr-only">{label}</figcaption>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid stroke="#E7E5E4" horizontal={false} />
            <XAxis type="number" tick={axis} tickLine={false} axisLine={false} tickFormatter={(v: number) => (money ? gbp(v).replace('.00', '') : String(v))} />
            <YAxis type="category" dataKey="name" tick={axis} tickLine={false} axisLine={false} width={120} />
            <Tooltip formatter={(v: number) => (money ? gbp(v) : v)} contentStyle={{ border: '1px solid #E7E5E4', borderRadius: 0, fontSize: 12 }} cursor={{ fill: '#F7F6F4' }} />
            <Bar dataKey="value" fill="#171717" barSize={14} isAnimationActive={!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.name}>
              <th scope="row">{d.name}</th>
              <td>{money ? gbp(d.value) : d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
