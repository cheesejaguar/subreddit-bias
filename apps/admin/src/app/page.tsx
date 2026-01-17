'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { ConfigurePanel } from '@/components/ConfigurePanel';
import { RunPanel } from '@/components/RunPanel';
import { MonitorPanel } from '@/components/MonitorPanel';
import { AuditPanel } from '@/components/AuditPanel';

type Tab = 'configure' | 'run' | 'monitor' | 'audit';

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>('configure');

  return (
    <div className="min-h-screen flex">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1 p-8">
        <header className="mb-8">
          <h1 className="text-2xl font-bold">Admin Studio</h1>
          <p className="text-muted-foreground">
            Configure, run, and monitor subreddit analysis
          </p>
        </header>

        {activeTab === 'configure' && <ConfigurePanel />}
        {activeTab === 'run' && <RunPanel />}
        {activeTab === 'monitor' && <MonitorPanel />}
        {activeTab === 'audit' && <AuditPanel />}
      </main>
    </div>
  );
}
