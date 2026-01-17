import { ReportList } from '@/components/ReportList';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      <Header />
      <div className="flex-1 max-w-5xl mx-auto px-4 py-12 w-full">
        <section className="mb-12">
          <h1 className="text-4xl font-bold mb-4">Subreddit Sentiment Analyzer</h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            Auditable, reproducible reports about subreddit language signals.
            Sentiment distributions, moderator analysis, and target-group hostility
            indicators with confidence intervals and methodology transparency.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Recent Reports</h2>
          <ReportList />
        </section>

        <section className="bg-muted rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-2">Methodology Note</h3>
          <p className="text-sm text-muted-foreground">
            Reports show measured indicators and uncertainty, not verdicts.
            All sampling is deterministic and reproducible. Classifications are
            aggregate-only to prevent individual targeting. See each report for
            full methodology details and limitations.
          </p>
        </section>
      </div>
      <Footer />
    </main>
  );
}
