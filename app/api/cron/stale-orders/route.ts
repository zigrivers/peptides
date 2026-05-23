import { NextResponse } from 'next/server';
import { markOrdersStale } from '@/lib/ordering/application/OrderService';

export async function POST(req: Request) {
  const auth = req.headers.get('authorization');
  if (!auth || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const staled = await markOrdersStale(new Date());
  return NextResponse.json({ staled });
}
