'use client';

export function Footer() {
  return (
    <footer className="border-t border-border mt-auto">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Subreddit Sentiment Analyzer - Language signal analysis tool
          </p>
          <div className="flex items-center gap-4">
            <a
              href="/privacy"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Privacy
            </a>
            <a
              href="/methodology"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Methodology
            </a>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground text-center">
            This tool does not make claims about individual users or group beliefs.
            Reports show measured indicators in sampled content with uncertainty estimates.
            Do not use for harassment or targeting individuals.
          </p>
        </div>
      </div>
    </footer>
  );
}
