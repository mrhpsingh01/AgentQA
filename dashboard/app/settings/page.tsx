"use client";

import { useState } from "react";
import { Settings, Key, Cpu, Bell, Shield, Save, Check } from "lucide-react";
import { Header } from "@/components/Header";

export default function SettingsPage() {
  const [provider, setProvider] = useState("gemini");
  const [geminiKey, setGeminiKey] = useState("••••••••••••••••••••••••••••••••••••");
  const [claudeKey, setClaudeKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
  const [slackWebhook, setSlackWebhook] = useState("https://hooks.slack.com/services/T00/B00/XXXX");
  const [healingThreshold, setHealingThreshold] = useState(55);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      <Header
        title="Settings & Integrations"
        subtitle="Manage Multi-LLM provider routing, CI/CD API credentials, and incident notification webhooks"
      />

      <div className="max-w-3xl space-y-6">
        {/* LLM Provider Configuration */}
        <div className="p-6 rounded-xl border border-border bg-card space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Cpu className="w-4 h-4 text-primary" />
            AI Self-Healing & Test Generation Engine
          </h3>
          <p className="text-xs text-slate-400">
            Select which LLM model family powers autonomous DOM inspection, selector repair, and Page Object Model synthesis:
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { id: "gemini", name: "Google Gemini", sub: "2.5 Flash (Ultra Fast)" },
              { id: "anthropic", name: "Anthropic Claude", sub: "3.5 Sonnet (High Accuracy)" },
              { id: "openai", name: "OpenAI", sub: "GPT-4o Mini" },
              { id: "ollama", name: "Local Ollama", sub: "Llama 3.2 (On-Premises)" },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setProvider(p.id)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  provider === p.id
                    ? "border-primary bg-primary/10 shadow-sm shadow-primary/20"
                    : "border-border bg-background hover:bg-card-hover text-slate-400"
                }`}
              >
                <span className={`text-xs font-bold block ${provider === p.id ? "text-white" : ""}`}>
                  {p.name}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">{p.sub}</span>
              </button>
            ))}
          </div>

          <div className="pt-2 space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Active Provider API Key / Endpoint
              </label>
              <input
                type="password"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                className="w-full p-2.5 bg-background border border-border rounded-lg text-xs font-mono text-white focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">
                  Minimum Self-Healing Confidence Threshold ({healingThreshold}%)
                </label>
                <span className="text-xs text-primary font-mono font-bold">{healingThreshold}%</span>
              </div>
              <input
                type="range"
                min="40"
                max="90"
                value={healingThreshold}
                onChange={(e) => setHealingThreshold(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <span className="text-[11px] text-slate-500">
                Selectors repaired with confidence below {healingThreshold}% will escalate to visual matching and decomposition.
              </span>
            </div>
          </div>
        </div>

        {/* Webhooks & Alerts */}
        <div className="p-6 rounded-xl border border-border bg-card space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Bell className="w-4 h-4 text-purple" />
            Alerts & CI/CD Notification Webhooks
          </h3>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Slack Incoming Webhook URL
              </label>
              <input
                type="text"
                value={slackWebhook}
                onChange={(e) => setSlackWebhook(e.target.value)}
                placeholder="https://hooks.slack.com/services/..."
                className="w-full p-2.5 bg-background border border-border rounded-lg text-xs font-mono text-white focus:outline-none focus:border-primary"
              />
              <span className="text-[11px] text-slate-500 block mt-1">
                Dispatches instant failure alerts with healing reports and error screenshots directly to your team channel.
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          className="px-6 py-2.5 text-xs font-bold text-white bg-primary hover:bg-primary-hover rounded-lg transition-colors flex items-center gap-2"
        >
          {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? "Saved Successfully" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
