'use client';

export function Header() {
  return (
    <header className="border-b border-border">
      <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl font-semibold">Subreddit Analyzer</span>
        </div>
        <nav className="flex items-center gap-4">
          <a href="/" className="text-sm hover:text-muted-foreground transition-colors">
            Home
          </a>
          <a href="/about" className="text-sm hover:text-muted-foreground transition-colors">
            About
          </a>
        </nav>
      </div>
    </header>
  );
}
