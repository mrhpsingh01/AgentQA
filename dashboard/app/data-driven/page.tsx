"use client";

import { useState } from "react";
import { FileSpreadsheet, Code2, Download, Copy, Sparkles } from "lucide-react";
import { Header } from "@/components/Header";
import { api } from "@/lib/api";

export default function DataDrivenStudioPage() {
  const [dataInput, setDataInput] = useState(JSON.stringify([
    { email: "standard_user@company.com", role: "member", expectedGreeting: "Welcome back, Member" },
    { email: "admin_user@company.com", role: "admin", expectedGreeting: "Admin Control Center" },
    { email: "billing_user@company.com", role: "billing_manager", expectedGreeting: "Invoices & Plans" }
  ], null, 2));

  const [generatedCode, setGeneratedCode] = useState("");
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    try {
      const parsed = JSON.parse(dataInput);
      const baseTest = `    await page.goto('/login');
    await page.getByTestId('email-input').fill(dataRow.email);
    await page.getByTestId('submit-btn').click();
    await expect(page.locator('#dashboard-greeting')).toHaveText(dataRow.expectedGreeting);`;

      const result = await api.parameterizeTest(baseTest, parsed);
      setGeneratedCode(result.code);
    } catch (e: any) {
      alert("Invalid JSON dataset: " + e.message);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <Header
        title="Data-Driven Testing Studio"
        subtitle="Bind CSV/JSON datasets to parameterized Playwright & Cypress test suites"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Dataset Editor */}
        <div className="p-6 rounded-xl border border-border bg-card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-primary" />
              Parameter Dataset (JSON / CSV Rows)
            </h3>
            <span className="text-[11px] text-slate-400 font-mono">3 test cases</span>
          </div>

          <textarea
            rows={14}
            value={dataInput}
            onChange={(e) => setDataInput(e.target.value)}
            className="w-full p-3 bg-background border border-border rounded-lg text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-primary"
          />

          <button
            onClick={handleGenerate}
            className="w-full py-2.5 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Synthesize Parameterized Spec
          </button>
        </div>

        {/* Generated Spec Preview */}
        <div className="p-6 rounded-xl border border-border bg-card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Code2 className="w-4 h-4 text-purple" />
              Generated Parameterized Playwright Spec
            </h3>
            {generatedCode && (
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold bg-background hover:bg-card-hover border border-border rounded-lg text-slate-300 transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                {copied ? "Copied!" : "Copy Code"}
              </button>
            )}
          </div>

          <div className="h-[280px] p-4 bg-background border border-border rounded-lg overflow-y-auto font-mono text-xs text-slate-300">
            {generatedCode ? (
              <pre className="whitespace-pre-wrap">{generatedCode}</pre>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                Click &quot;Synthesize Parameterized Spec&quot; to bind data rows to automation steps.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
