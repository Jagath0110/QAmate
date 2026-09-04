import { NextResponse } from 'next/server';
import { getIssues, issuePipeline } from '@/lib/metrics';

export const dynamic = 'force-dynamic';

export async function GET() {
  const issues = await getIssues();
  return NextResponse.json({ total: issues.length, pipeline: issuePipeline(issues), issues });
}
