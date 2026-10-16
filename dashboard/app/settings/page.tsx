import { Header } from "@/components/Header";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <Header title="Settings & Integrations" subtitle="Configure credentials on the backend server." />
      <div className="p-5 rounded-xl border border-border bg-card text-sm text-slate-300 space-y-3">
        <p>The dashboard has no settings persistence API. Set provider credentials, notification webhooks and healing thresholds in the backend environment, then restart the service.</p>
        <p>The standalone demo is read only and does not accept or store API keys.</p>
      </div>
    </div>
  );
}
