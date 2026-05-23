import { NextResponse } from 'next/server';
import { processPendingDeletions } from '@/lib/admin/application/AdminService';

export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!cronSecret || !auth || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await processPendingDeletions();
  return NextResponse.json(result);
}
