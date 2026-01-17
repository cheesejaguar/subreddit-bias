'use client';

type Tab = 'configure' | 'run' | 'monitor' | 'audit';

interface SidebarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'configure', label: 'Configure', icon: 'settings' },
  { id: 'run', label: 'Run', icon: 'play' },
  { id: 'monitor', label: 'Monitor', icon: 'activity' },
  { id: 'audit', label: 'Audit', icon: 'search' },
];

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  return (
    <aside className="w-64 bg-muted border-r border-border min-h-screen p-4">
      <div className="mb-8">
        <h2 className="text-lg font-semibold">Admin Studio</h2>
        <p className="text-xs text-muted-foreground">Localhost only</p>
      </div>

      <nav className="space-y-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
              activeTab === tab.id
                ? 'bg-background text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="mt-8 pt-8 border-t border-border">
        <div className="text-xs text-muted-foreground">
          <p className="mb-1">Environment: Development</p>
          <p>Database: Connected</p>
        </div>
      </div>
    </aside>
  );
}
