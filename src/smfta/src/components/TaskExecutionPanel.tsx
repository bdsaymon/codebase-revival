import React from 'react';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Pause,
  Play,
  RotateCcw,
  X,
  ListOrdered,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
} from 'lucide-react';
import {
  TaskExecutionPlan,
  setPlanPaused,
  setPlanResumed,
  setPlanCancelled,
  retryFailedTask,
  confirmPlanStep,
} from '../utils/taskExecutionEngine';

export interface TaskExecutionPanelProps {
  plan: TaskExecutionPlan;
  onChangePlan: (updated: TaskExecutionPlan) => void;
  onExecuteNextStep?: () => void;
  onDismiss?: () => void;
}

export const TaskExecutionPanel: React.FC<TaskExecutionPanelProps> = ({
  plan,
  onChangePlan,
  onExecuteNextStep,
  onDismiss,
}) => {
  const [collapsed, setCollapsed] = React.useState(false);

  const completedCount = plan.tasks.filter((t) => t.status === 'completed').length;
  const progressPct = Math.round((completedCount / plan.tasks.length) * 100);

  const handlePause = () => {
    onChangePlan(setPlanPaused(plan));
  };

  const handleResume = () => {
    onChangePlan(setPlanResumed(plan));
  };

  const handleCancel = () => {
    onChangePlan(setPlanCancelled(plan));
  };

  const handleRetry = () => {
    onChangePlan(retryFailedTask(plan));
    onExecuteNextStep?.();
  };

  const handleConfirmStep = () => {
    onChangePlan(confirmPlanStep(plan));
    onExecuteNextStep?.();
  };

  const formatStatusLabel = (status: string) => {
    if (status === 'waiting_for_confirmation') return 'Waiting for Confirmation';
    return status;
  };

  return (
    <div className="my-3 rounded-2xl border border-[var(--primary-border)] bg-[var(--surface)] p-3 sm:p-4 shadow-lg transition-all">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[var(--border)]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-[var(--primary-soft)] text-[var(--primary)] flex items-center justify-center shrink-0">
            <ListOrdered className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[var(--text)] truncate max-w-[220px] sm:max-w-md">
                {plan.goal}
              </span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold border ${
                  plan.status === 'completed'
                    ? 'border-emerald-500/40 text-emerald-500 bg-emerald-500/10'
                    : plan.status === 'failed'
                    ? 'border-rose-500/40 text-rose-500 bg-rose-500/10'
                    : plan.status === 'paused' || plan.status === 'waiting_for_confirmation'
                    ? 'border-amber-500/40 text-amber-500 bg-amber-500/10'
                    : 'border-indigo-500/40 text-indigo-400 bg-indigo-500/10'
                }`}
              >
                {formatStatusLabel(plan.status)}
              </span>
            </div>
            <div className="text-[11px] text-[var(--text-3)]">
              {completedCount} of {plan.tasks.length} steps completed ({progressPct}%)
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {plan.status === 'waiting_for_confirmation' && (
            <button
              type="button"
              onClick={handleConfirmStep}
              className="px-2.5 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 cursor-pointer text-xs font-semibold flex items-center gap-1"
              title="Approve & Continue step"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Approve & Continue</span>
            </button>
          )}

          {plan.status === 'running' && (
            <button
              type="button"
              onClick={handlePause}
              className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-2)] hover:text-[var(--text)] cursor-pointer text-xs flex items-center gap-1"
              title="Pause task execution"
            >
              <Pause className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Pause</span>
            </button>
          )}

          {plan.status === 'paused' && (
            <button
              type="button"
              onClick={handleResume}
              className="p-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 cursor-pointer text-xs flex items-center gap-1"
              title="Resume execution"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span className="hidden sm:inline">Resume</span>
            </button>
          )}

          {plan.status === 'failed' && (
            <button
              type="button"
              onClick={handleRetry}
              className="p-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 cursor-pointer text-xs flex items-center gap-1"
              title="Retry failed step"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Retry</span>
            </button>
          )}

          {plan.status !== 'completed' && plan.status !== 'cancelled' && (
            <button
              type="button"
              onClick={handleCancel}
              className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-3)] hover:text-rose-500 cursor-pointer text-xs"
              title="Cancel execution"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-[var(--text)] cursor-pointer"
            title={collapsed ? 'Expand tasks' : 'Collapse tasks'}
          >
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>

          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="p-1.5 text-[var(--text-3)] hover:text-[var(--text)] cursor-pointer"
              title="Dismiss panel"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-[var(--surface-2)] h-1.5 rounded-full mt-2.5 overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${
            plan.status === 'completed'
              ? 'bg-emerald-500'
              : plan.status === 'failed'
              ? 'bg-rose-500'
              : plan.status === 'waiting_for_confirmation'
              ? 'bg-amber-500'
              : 'bg-[var(--primary)]'
          }`}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Tasks List */}
      {!collapsed && (
        <div className="space-y-2 mt-3 max-h-64 overflow-y-auto pr-1">
          {plan.tasks.map((task, idx) => {
            const isCurrent = idx === plan.currentTaskIndex && (plan.status === 'running' || plan.status === 'waiting_for_confirmation');
            return (
              <div
                key={task.id}
                className={`flex items-start justify-between gap-3 p-2.5 rounded-xl border text-xs transition-colors ${
                  task.status === 'completed'
                    ? 'border-emerald-500/20 bg-emerald-500/5 text-[var(--text)]'
                    : task.status === 'failed'
                    ? 'border-rose-500/30 bg-rose-500/5 text-rose-300'
                    : task.status === 'waiting_for_confirmation'
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                    : isCurrent
                    ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--text)]'
                    : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-2)]'
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="mt-0.5 shrink-0">
                    {task.status === 'completed' && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    )}
                    {task.status === 'failed' && (
                      <AlertCircle className="w-4 h-4 text-rose-500" />
                    )}
                    {task.status === 'running' && (
                      <div className="w-4 h-4 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
                    )}
                    {task.status === 'waiting_for_confirmation' && (
                      <ShieldAlert className="w-4 h-4 text-amber-400" />
                    )}
                    {task.status === 'pending' && (
                      <Clock className="w-4 h-4 text-[var(--text-3)]" />
                    )}
                    {task.status === 'paused' && (
                      <Pause className="w-4 h-4 text-amber-500" />
                    )}
                  </div>

                  <div className="min-w-0 space-y-0.5">
                    <div className="font-semibold text-xs flex items-center gap-1.5">
                      <span>{idx + 1}.</span>
                      <span className="truncate">{task.title}</span>
                    </div>
                    {task.description && task.description !== task.title && (
                      <p className="text-[11px] text-[var(--text-3)] leading-relaxed">
                        {task.description}
                      </p>
                    )}
                    {task.errorReason && (
                      <p className="text-[11px] text-rose-400 font-mono mt-1">
                        Reason: {task.errorReason}
                      </p>
                    )}
                    {task.resultSnippet && (
                      <p className="text-[11px] text-emerald-400 font-mono mt-0.5">
                        Validation: {task.resultSnippet}
                      </p>
                    )}
                  </div>
                </div>

                <span className="text-[10px] font-mono uppercase tracking-wider shrink-0 text-[var(--text-3)]">
                  {formatStatusLabel(task.status)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
