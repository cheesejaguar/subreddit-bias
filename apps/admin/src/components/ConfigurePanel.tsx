'use client';

import { useState } from 'react';

export function ConfigurePanel() {
  const [samplingConfig, setSamplingConfig] = useState({
    strategies: ['top', 'new'],
    postsPerStrategy: 25,
    commentsPerPost: 50,
    maxDepth: 2,
  });

  const [modelConfig, setModelConfig] = useState({
    model: 'openai/gpt-4o-mini',
    batchSize: 10,
  });

  const [frameworks, setFrameworks] = useState<string[]>(['nexus', 'jda']);

  return (
    <div className="space-y-8">
      <section className="card">
        <h2 className="text-lg font-semibold mb-4">Sampling Configuration</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Strategies</label>
            <div className="space-y-2">
              {['top', 'new', 'controversial'].map((strategy) => (
                <label key={strategy} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={samplingConfig.strategies.includes(strategy)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSamplingConfig({
                          ...samplingConfig,
                          strategies: [...samplingConfig.strategies, strategy],
                        });
                      } else {
                        setSamplingConfig({
                          ...samplingConfig,
                          strategies: samplingConfig.strategies.filter((s) => s !== strategy),
                        });
                      }
                    }}
                    className="rounded"
                  />
                  <span className="text-sm capitalize">{strategy}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Posts per Strategy</label>
              <input
                type="number"
                value={samplingConfig.postsPerStrategy}
                onChange={(e) =>
                  setSamplingConfig({
                    ...samplingConfig,
                    postsPerStrategy: parseInt(e.target.value) || 25,
                  })
                }
                className="input"
                min={1}
                max={100}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Comments per Post</label>
              <input
                type="number"
                value={samplingConfig.commentsPerPost}
                onChange={(e) =>
                  setSamplingConfig({
                    ...samplingConfig,
                    commentsPerPost: parseInt(e.target.value) || 50,
                  })
                }
                className="input"
                min={1}
                max={500}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Max Depth</label>
              <input
                type="number"
                value={samplingConfig.maxDepth}
                onChange={(e) =>
                  setSamplingConfig({
                    ...samplingConfig,
                    maxDepth: parseInt(e.target.value) || 2,
                  })
                }
                className="input"
                min={0}
                max={10}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold mb-4">Model Configuration</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">OpenRouter Model</label>
            <select
              value={modelConfig.model}
              onChange={(e) => setModelConfig({ ...modelConfig, model: e.target.value })}
              className="input"
            >
              <option value="openai/gpt-4o-mini">GPT-4o Mini (Recommended)</option>
              <option value="openai/gpt-4o">GPT-4o</option>
              <option value="openai/gpt-3.5-turbo">GPT-3.5 Turbo</option>
              <option value="anthropic/claude-3-haiku">Claude 3 Haiku</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Batch Size</label>
            <input
              type="number"
              value={modelConfig.batchSize}
              onChange={(e) =>
                setModelConfig({
                  ...modelConfig,
                  batchSize: parseInt(e.target.value) || 10,
                })
              }
              className="input"
              min={1}
              max={50}
            />
          </div>
        </div>
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold mb-4">Target Group Frameworks</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Select which frameworks to use for target group hostility detection.
        </p>
        <div className="space-y-2">
          {[
            { id: 'nexus', label: 'Nexus Document', desc: 'Balanced approach for speech boundaries' },
            { id: 'jda', label: 'Jerusalem Declaration (JDA)', desc: 'Context-aware antisemitism definition' },
            { id: 'ihra', label: 'IHRA Working Definition', desc: 'Widely adopted international standard' },
          ].map((framework) => (
            <label key={framework.id} className="flex items-start gap-2 p-3 border border-border rounded-md cursor-pointer hover:bg-muted/50">
              <input
                type="checkbox"
                checked={frameworks.includes(framework.id)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setFrameworks([...frameworks, framework.id]);
                  } else {
                    setFrameworks(frameworks.filter((f) => f !== framework.id));
                  }
                }}
                className="mt-1"
              />
              <div>
                <span className="text-sm font-medium">{framework.label}</span>
                <p className="text-xs text-muted-foreground">{framework.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </section>

      <div className="flex justify-end gap-2">
        <button className="btn btn-secondary">Reset to Defaults</button>
        <button className="btn btn-primary">Save Configuration</button>
      </div>
    </div>
  );
}
