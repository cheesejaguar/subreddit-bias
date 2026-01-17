'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { ConfigurePanel } from '@/components/ConfigurePanel';
import { RunPanel } from '@/components/RunPanel';
import { MonitorPanel } from '@/components/MonitorPanel';
import { AuditPanel } from '@/components/AuditPanel';

type Tab = 'configure' | 'run' | 'monitor' | 'audit';

interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  services: {
    database: { status: 'ok' | 'error' | 'unknown'; message: string };
    redis: { status: 'ok' | 'error' | 'unknown'; message: string };
  };
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>('configure');
  const [health, setHealth] = useState<HealthStatus | null>(null);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const response = await fetch('/api/admin/health');
        const data = await response.json();
        setHealth(data);
      } catch {
        setHealth({
          status: 'error',
          services: {
            database: { status: 'error', message: 'API unreachable' },
            redis: { status: 'unknown', message: 'Unknown' },
          },
        });
      }
    };

    fetchHealth();
    // Refresh health status every 30 seconds
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusIndicator = (status: 'ok' | 'error' | 'unknown' | 'degraded') => {
    switch (status) {
      case 'ok':
        return 'bg-green-500';
      case 'error':
        return 'bg-red-500';
      case 'degraded':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-400';
    }
  };

  return (
    <div className="min-h-screen flex">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1 p-8">
        <header className="mb-8">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold">Admin Studio</h1>
              <p className="text-muted-foreground">
                Configure, run, and monitor subreddit analysis
              </p>
            </div>
            {health && (
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${getStatusIndicator(
                      health.services.database.status
                    )}`}
                  />
                  <span className="text-muted-foreground">Database</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${getStatusIndicator(
                      health.services.redis.status
                    )}`}
                  />
                  <span className="text-muted-foreground">Cache</span>
                </div>
              </div>
            )}
          </div>
        </header>

        {activeTab === 'configure' && <ConfigurePanel />}
        {activeTab === 'run' && <RunPanel />}
        {activeTab === 'monitor' && <MonitorPanel />}
        {activeTab === 'audit' && <AuditPanel />}
      </main>
    </div>
  );
}
