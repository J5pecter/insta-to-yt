import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Plus,
  Play,
  CheckCircle2,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Sliders,
  Sparkles,
  ArrowRight,
  Zap,
  Layers
} from 'lucide-react';
import { api } from '../services/api';
import { useFeedback } from '../components/Feedback';

export const AutomationsPage: React.FC = () => {
  const { notify, confirmAction } = useFeedback();
  const [automations, setAutomations] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dryRunResult, setDryRunResult] = useState<any | null>(null);
  const [dryRunning, setDryRunning] = useState(false);

  const loadAutomations = async () => {
    setLoading(true);
    try {
      const res = await api.listAutomations();
      setAutomations(res.items || []);
      const tpls = await api.getAutomationTemplates();
      setTemplates(tpls || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAutomations();
  }, []);

  const handleToggle = async (auto: any) => {
    try {
      if (auto.enabled) {
        await api.disableAutomation(auto.id);
      } else {
        await api.enableAutomation(auto.id);
      }
      loadAutomations();
    } catch (err: any) {
      notify(`Toggle failed: ${err.message}`, 'error');
    }
  };

  const handleInstallTemplate = async (tpl: any) => {
    try {
      await api.createAutomation({
        name: tpl.name,
        description: tpl.description,
        workflow_definition: tpl.workflow_definition,
        enabled: true,
      });
      notify(`Installed: ${tpl.name}!`, 'success');
      loadAutomations();
    } catch (err: any) {
      notify(`Template installation failed: ${err.message}`, 'error');
    }
  };

  const handleDryRun = async (workflowDef: any) => {
    setDryRunning(true);
    setDryRunResult(null);
    try {
      const res = await api.dryRunWorkflow(workflowDef);
      setDryRunResult(res);
      notify('Test Workflow simulation completed.', 'info');
    } catch (err: any) {
      notify(`Test Workflow failed: ${err.message}`, 'error');
    } finally {
      setDryRunning(false);
    }
  };

  const handleRunReal = async (auto: any) => {
    setDryRunning(true);
    setDryRunResult(null);
    try {
      const res = await api.runWorkflow(auto.id);
      setDryRunResult(res);
      notify(`Workflow "${auto.name}" executed (status: ${res.status}).`, res.status === 'completed' ? 'success' : 'warning');
    } catch (err: any) {
      notify(`Run Workflow failed: ${err.message}`, 'error');
    } finally {
      setDryRunning(false);
    }
  };

  const handleDelete = async (id: number) => {
    const ok = await confirmAction({
      title: 'Delete automation workflow?',
      message: 'This will remove the workflow definition and its run history.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.deleteAutomation(id);
      notify('Automation deleted.', 'info');
      loadAutomations();
    } catch (err: any) {
      notify(`Delete failed: ${err.message}`, 'error');
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Automation Builder</h1>
        <p className="text-sm text-muted">
          Configure rule-based triggers, conditions, and automated publishing DAG workflows without cloud middleware.
        </p>
      </div>

      {/* Installed Automations */}
      <div className="p-6 rounded-2xl bg-surface border border-border space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Cpu className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Active Workflows</h2>
          </div>
          <span className="text-xs text-muted">{automations.length} installed</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
          </div>
        ) : automations.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted border border-dashed border-border rounded-xl space-y-2">
            <p>No custom automations configured yet.</p>
            <p className="text-[11px]">Install one of the ready-made templates below to get started immediately.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {automations.map((a) => (
              <div
                key={a.id}
                className="p-4 rounded-xl bg-elevated border border-border flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-foreground">{a.name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      a.enabled ? 'bg-success/20 text-success' : 'bg-muted/20 text-muted'
                    }`}>
                      {a.enabled ? 'Enabled' : 'Paused'}
                    </span>
                  </div>
                  <p className="text-xs text-muted">{a.description || 'Custom workflow rule'}</p>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleDryRun(a.workflow_definition)}
                    disabled={dryRunning}
                    className="px-3 py-1.5 rounded-lg bg-surface border border-border text-xs text-foreground font-medium flex items-center space-x-1 hover:border-primary"
                    title="Simulate without publishing"
                  >
                    <Play className="w-3.5 h-3.5 text-muted" />
                    <span>Test Workflow</span>
                  </button>
                  <button
                    onClick={() => handleRunReal(a)}
                    disabled={dryRunning || !a.enabled}
                    className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-50 text-xs text-white font-semibold flex items-center space-x-1"
                    title="Execute through real backend handlers"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Run Workflow</span>
                  </button>
                  <button
                    onClick={() => handleToggle(a)}
                    className="p-1.5 rounded-lg bg-surface border border-border text-foreground hover:bg-elevated"
                    title={a.enabled ? 'Disable' : 'Enable'}
                  >
                    {a.enabled ? <ToggleRight className="w-5 h-5 text-success" /> : <ToggleLeft className="w-5 h-5 text-muted" />}
                  </button>
                  <button
                    onClick={() => handleDelete(a.id)}
                    className="p-1.5 rounded-lg bg-surface border border-border text-muted hover:text-destructive hover:bg-destructive/10"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dry Run Output Drawer */}
      {dryRunResult && (
        <div className="p-5 rounded-2xl bg-surface border border-primary/40 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-primary flex items-center space-x-1.5">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              <span>Dry Run Simulation Output ({dryRunResult.evaluated_nodes} nodes evaluated)</span>
            </span>
            <button onClick={() => setDryRunResult(null)} className="text-muted hover:text-foreground text-xs">
              Close
            </button>
          </div>
          <div className="p-3 rounded-xl bg-background border border-border max-h-48 overflow-y-auto space-y-2 text-xs font-mono">
            {dryRunResult.logs?.map((l: any, idx: number) => (
              <div key={idx} className="flex items-start space-x-2">
                <span className="text-primary font-bold">[{l.node_type}]</span>
                <span className="text-muted">{l.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ready-Made Production Templates */}
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Ready-Made Automation Templates</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className="p-5 rounded-2xl bg-surface border border-border flex flex-col justify-between space-y-4 hover:border-primary/40 transition-colors"
            >
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center text-primary flex-shrink-0">
                    <Zap className="w-4 h-4 text-primary" />
                  </div>
                  <span className="text-xs font-bold text-foreground">{tpl.name}</span>
                </div>
                <p className="text-xs text-muted leading-relaxed">{tpl.description}</p>

                {/* Workflow Node Chain Preview */}
                <div className="pt-2 flex flex-wrap gap-1">
                  {tpl.workflow_definition?.nodes?.slice(0, 4).map((n: any, i: number) => (
                    <span key={i} className="px-2 py-0.5 rounded bg-elevated border border-border text-[10px] text-muted">
                      {n.data?.label || n.type}
                    </span>
                  ))}
                  {tpl.workflow_definition?.nodes?.length > 4 && (
                    <span className="text-[10px] text-muted self-center">
                      +{tpl.workflow_definition.nodes.length - 4} more
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleInstallTemplate(tpl)}
                className="w-full py-2 rounded-xl bg-elevated hover:bg-primary hover:text-white border border-border text-foreground text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Install Template</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
