import { NextResponse } from 'next/server';
import { markOrdersStale } from '@/lib/ordering/application/OrderService';

export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!cronSecret || !auth || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const staled = await markOrdersStale(new Date());
  return NextResponse.json({ staled });
}
