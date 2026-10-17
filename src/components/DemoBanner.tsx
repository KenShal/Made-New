import { DEMO_MODE } from '@/lib/config';

export function DemoBanner() {
  if (!DEMO_MODE) return null;
  return (
    <div className="bg-ink px-4 py-2 text-center text-[0.72rem] font-medium tracking-wide text-white/85">
      <strong className="font-semibold text-white">Preview store.</strong> <span className="sm:hidden">Sample data only. No orders or payments.</span>
      <span className="hidden sm:inline">Products, creators, campaigns and totals are sample data. No orders are taken and no payment is collected.</span>
    </div>
  );
}
