'use client';

import PageHeader from '../../components/PageHeader';

export default function DailyPerformancePage() {
  return (
    <div className="flex h-[calc(100vh)] flex-col overflow-hidden">
      <PageHeader
        eyebrow="DAILY PERFORMANCE"
        title="일일 실적 관리"
        description="일별 실적 집계·관리 화면입니다. (준비 중)"
      />
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-muted">일일 실적 관리 기능을 준비 중입니다.</p>
      </div>
    </div>
  );
}
