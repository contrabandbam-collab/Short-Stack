import React, { useState, useEffect } from 'react';
import type {
  Business,
  Category,
  CustomerReview,
  ListingStatus,
  ModerationAction,
  BusinessReport,
  AuditEvent,
  ReminderLog,
} from '../types/pipsqueak.ts';
import {
  Shield,
  Layers,
  FileCheck2,
  AlertTriangle,
  CreditCard,
  History,
  Settings,
  Plus,
  CheckCircle2,
  XCircle,
  PauseCircle,
  RefreshCw,
  ExternalLink,
  Tag,
  Check,
  Star,
  MessageSquare,
  Eye,
  EyeOff,
  Flag,
  Users,
} from 'lucide-react';
import { ShortStackLogo } from './ShortStackLogo.tsx';

interface AdminDashboardProps {
  categories: Category[];
  businesses: Business[];
  onRefreshData: () => Promise<void>;
  onOpenProfile: (id: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  categories,
  businesses,
  onRefreshData,
  onOpenProfile,
}) => {
  const [activeTab, setActiveTab] = useState<
    'moderation' | 'categories' | 'reports' | 'reviews' | 'payments' | 'promotions' | 'owners' | 'audit' | 'integrations'
  >('moderation');

  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [reminderLogs, setReminderLogs] = useState<ReminderLog[]>([]);
  const [reports, setReports] = useState<BusinessReport[]>([]);
  const [reviews, setReviews] = useState<CustomerReview[]>([]);
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [promotionsList, setPromotionsList] = useState<any[]>([]);
  const [referralsList, setReferralsList] = useState<any[]>([]);

  // Moderation action modal state
  const [modTargetBusiness, setModTargetBusiness] = useState<Business | null>(null);
  const [modNewStatus, setModNewStatus] = useState<ListingStatus>('suspended');
  const [modReason, setModReason] = useState('');
  const [modSubmitting, setModSubmitting] = useState(false);

  // Category editor & custom categories review state
  const [newCatName, setNewCatName] = useState('');
  const [newCatId, setNewCatId] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [newCatKeywords, setNewCatKeywords] = useState('');
  const [customCatSubmissions, setCustomCatSubmissions] = useState<
    { customCategory: string; count: number; sampleBusinesses: { id: string; name: string }[] }[]
  >([]);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editCatKeywords, setEditCatKeywords] = useState('');
  const [editCatDesc, setEditCatDesc] = useState('');

  // Scheduler runner state
  const [runningJob, setRunningJob] = useState(false);
  const [jobResult, setJobResult] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminData();
  }, [activeTab]);

  const fetchAdminData = async () => {
    try {
      const [audRes, repRes, sysRes, revRes, usrRes, prmRes, refRes] = await Promise.all([
        fetch('/api/moderation/audit-history'),
        fetch('/api/moderation/reports'),
        fetch('/api/system/status'),
        fetch('/api/admin/reviews'),
        fetch('/api/admin/users'),
        fetch('/api/admin/promotions'),
        fetch('/api/referrals/my-referrals'),
      ]);

      if (audRes.ok) {
        const audData = await audRes.json();
        setAuditEvents(audData.events || []);
        setReminderLogs(audData.reminders || []);
      }
      if (repRes.ok) {
        const repData = await repRes.json();
        setReports(repData.reports || []);
      }
      if (revRes.ok) {
        const revData = await revRes.json();
        setReviews(revData.reviews || []);
      }
      if (sysRes.ok) {
        const sysData = await sysRes.json();
        setSystemStatus(sysData);
      }
      if (usrRes.ok) {
        const usrData = await usrRes.json();
        setUsersList(usrData.users || []);
      }
      if (prmRes.ok) {
        const prmData = await prmRes.json();
        setPromotionsList(prmData.promotions || []);
      }
      if (refRes.ok) {
        const refData = await refRes.json();
        setReferralsList(refData.referrals || []);
      }
    } catch (e) {
      console.error('Error fetching admin data', e);
    }
  };

  const handleToggleReviewStatus = async (reviewId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'published' ? 'hidden' : 'published';
    const notes = prompt(
      newStatus === 'hidden'
        ? 'Enter reason for hiding this review (violates content rules, spam, etc.):'
        : 'Enter note for restoring this review:'
    );
    if (notes === null) return;

    try {
      const res = await fetch(`/api/admin/reviews/${reviewId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          adminNotes: notes || undefined,
        }),
      });
      if (res.ok) {
        await onRefreshData();
        await fetchAdminData();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to update review status');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleModerationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modTargetBusiness || !modReason.trim()) return;

    setModSubmitting(true);
    try {
      const res = await fetch('/api/moderation/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: modTargetBusiness.id,
          newStatus: modNewStatus,
          reason: modReason.trim(),
        }),
      });

      if (res.ok) {
        setModTargetBusiness(null);
        setModReason('');
        await onRefreshData();
        await fetchAdminData();
      }
    } finally {
      setModSubmitting(false);
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName || !newCatId) return;

    const keywords = newCatKeywords
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter((k) => k.length > 0);

    const newCategory: Category = {
      id: newCatId.trim().toLowerCase().replace(/\s+/g, '-'),
      name: newCatName.trim(),
      description: newCatDesc.trim() || 'Local business category',
      suggestedKeywords: keywords,
      requiresMenu: false,
      categoryFields: [],
    };

    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCategory),
    });

    if (res.ok) {
      setNewCatName('');
      setNewCatId('');
      setNewCatDesc('');
      setNewCatKeywords('');
      await onRefreshData();
    }
  };

  const handleRunScheduler = async () => {
    setRunningJob(true);
    setJobResult(null);
    try {
      const res = await fetch('/api/scheduler/run-checks', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setJobResult(
          `Scheduler check completed. Hidden: ${data.result.hiddenCount}, Reminders Logged: ${data.result.remindersQueuedCount}`
        );
        await onRefreshData();
        await fetchAdminData();
      }
    } finally {
      setRunningJob(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-neutral-200">
        <div>
          <div className="mb-2">
            <ShortStackLogo size="sm" variant="horizontal" showTagline={false} />
          </div>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-neutral-900" />
            <h1 className="text-2xl font-bold font-display text-neutral-900 tracking-tight">
              Short Stack Admin Command Center
            </h1>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Protected administrator dashboard for listing oversight, account reviews, category management, and audit records.
          </p>
        </div>

        <button
          onClick={handleRunScheduler}
          disabled={runningJob}
          className="inline-flex items-center gap-1.5 py-2 px-3 text-xs font-semibold text-neutral-800 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors border border-neutral-200"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${runningJob ? 'animate-spin' : ''}`} />
          {runningJob ? 'Running Expiration Checks...' : 'Run Expiration Checks'}
        </button>
      </div>

      {jobResult && (
        <div className="p-3 bg-neutral-100 border border-neutral-200 rounded-lg text-xs text-neutral-800 flex justify-between items-center">
          <span>{jobResult}</span>
          <button onClick={() => setJobResult(null)} className="text-neutral-500 hover:text-neutral-900">
            Dismiss
          </button>
        </div>
      )}

      {/* IN-APP LAUNCH READINESS STATUS BANNER */}
      <div className="bg-amber-500/10 border-2 border-amber-600/30 rounded-xl p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-600/20 pb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <h2 className="text-sm font-bold font-display uppercase tracking-wider text-amber-950">
              Launch Readiness Status: NOT READY FOR PRODUCTION (BLOCKED)
            </h2>
          </div>
          <span className="font-mono text-[11px] font-semibold px-2.5 py-0.5 rounded bg-amber-600/20 text-amber-900 border border-amber-600/30">
            Fail-Closed Enforcement Active
          </span>
        </div>

        <p className="text-xs text-amber-900/90 leading-relaxed">
          The app cannot be called launch-ready based on local code or automated tests alone. Core production infrastructure is unconfigured. All mutating production routes and privileged operations strictly fail closed with 503 until the account owner configures the required external services.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-xs">
          <div className="p-3 bg-white/80 rounded-lg border border-amber-600/20 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-neutral-900">1. Durable Database</span>
              <span className="font-mono text-[10px] px-2 py-0.2 rounded font-semibold bg-red-100 text-red-800">UNCONFIGURED</span>
            </div>
            <p className="text-[11px] text-neutral-600">
              Production writes to JSON files are blocked. Migrations & RLS policies: <strong className="text-neutral-800">Unverified</strong> (no live DB connection reachable).
            </p>
            <p className="text-[11px] font-mono text-neutral-700 bg-neutral-100 p-1.5 rounded">
              Needs: <strong>DATABASE_URL</strong> or <strong>SUPABASE_URL</strong> + <strong>SUPABASE_SERVICE_ROLE_KEY</strong>
            </p>
          </div>

          <div className="p-3 bg-white/80 rounded-lg border border-amber-600/20 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-neutral-900">2. Authentication Provider</span>
              <span className="font-mono text-[10px] px-2 py-0.2 rounded font-semibold bg-red-100 text-red-800">UNCONFIGURED</span>
            </div>
            <p className="text-[11px] text-neutral-600">
              Server-side identity verification fails closed. Public sign-up and password login require a trusted provider.
            </p>
            <p className="text-[11px] font-mono text-neutral-700 bg-neutral-100 p-1.5 rounded">
              Needs: <strong>AUTH_PROVIDER</strong> and <strong>AUTH_SECRET</strong>
            </p>
          </div>

          <div className="p-3 bg-white/80 rounded-lg border border-amber-600/20 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-neutral-900">3. Shared Session Store</span>
              <span className="font-mono text-[10px] px-2 py-0.2 rounded font-semibold bg-red-100 text-red-800">UNCONFIGURED</span>
            </div>
            <p className="text-[11px] text-neutral-600">
              In-memory sessions only. Multi-instance shared session persistence fails closed for privileged routes in production.
            </p>
            <p className="text-[11px] font-mono text-neutral-700 bg-neutral-100 p-1.5 rounded">
              Needs: <strong>REDIS_URL</strong>, <strong>SESSION_STORE_URL</strong>, or <strong>DATABASE_URL</strong> with <strong>SESSION_SECRET</strong>
            </p>
          </div>

          <div className="p-3 bg-white/80 rounded-lg border border-amber-600/20 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-neutral-900">4. Square Live Payments</span>
              <span className="font-mono text-[10px] px-2 py-0.2 rounded font-semibold bg-amber-100 text-amber-800">OWNER BLOCKER</span>
            </div>
            <p className="text-[11px] text-neutral-600">
              Sandbox mode only. Live cards cannot be charged until account owner provisions real Square credentials.
            </p>
            <p className="text-[11px] font-mono text-neutral-700 bg-neutral-100 p-1.5 rounded">
              Needs: <strong>SQUARE_APPLICATION_ID</strong>, <strong>SQUARE_LOCATION_ID</strong>, <strong>SQUARE_ACCESS_TOKEN</strong>, <strong>SQUARE_LIVE_PAYMENTS_ENABLED=true</strong>
            </p>
          </div>
        </div>

        <div className="p-2.5 bg-white/70 rounded-lg border border-amber-600/20 text-[11px] text-neutral-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span>
            <strong>Asset Provenance Note:</strong> Miami skyline hero image (/images/wide_cinematic_blurred_city_skyline_at_sunset_su.png) provenance/license is <span className="font-semibold text-amber-800">Unverified</span>. Needs owner confirmation before public release.
          </span>
          <button
            onClick={() => setActiveTab('integrations')}
            className="text-amber-800 hover:text-amber-950 font-semibold underline shrink-0"
          >
            Inspect Detailed Boundaries →
          </button>
        </div>
      </div>

      {/* Navigation Tabs (Functional Buttons / Segmented Controls) */}
      <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-lg w-fit border border-neutral-200 overflow-x-auto">
        <button
          onClick={() => setActiveTab('moderation')}
          className={`py-1.5 px-3 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
            activeTab === 'moderation' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          Listing Review ({businesses.length})
        </button>
        <button
          onClick={() => setActiveTab('categories')}
          className={`py-1.5 px-3 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
            activeTab === 'categories' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          Categories & Keywords ({categories.length})
        </button>
        <button
          onClick={() => setActiveTab('reports')}
          className={`py-1.5 px-3 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
            activeTab === 'reports' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          Reports Queue ({reports.filter((r) => r.status === 'pending').length})
        </button>
        <button
          onClick={() => setActiveTab('reviews')}
          className={`py-1.5 px-3 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
            activeTab === 'reviews' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          Customer Reviews ({reviews.length})
        </button>
        <button
          onClick={() => setActiveTab('payments')}
          className={`py-1.5 px-3 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
            activeTab === 'payments' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          Advertising Fees & Terms
        </button>
        <button
          onClick={() => setActiveTab('promotions')}
          className={`py-1.5 px-3 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
            activeTab === 'promotions' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          Promotions ({promotionsList.length})
        </button>
        <button
          onClick={() => setActiveTab('owners')}
          className={`py-1.5 px-3 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
            activeTab === 'owners' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          Owners & Accounts ({usersList.length})
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`py-1.5 px-3 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
            activeTab === 'audit' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          Audit Ledger ({auditEvents.length})
        </button>
        <button
          onClick={() => setActiveTab('integrations')}
          className={`py-1.5 px-3 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
            activeTab === 'integrations' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          System Integrations
        </button>
      </div>

      {/* TAB 1: LISTING MODERATION */}
      {activeTab === 'moderation' && (
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
          <div className="p-4 border-b border-neutral-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-900 font-display">Directory Listings Directory</h3>
            <span className="text-xs text-neutral-500">Only Active listings are visible to public visitors</span>
          </div>

          <div className="divide-y divide-neutral-100 overflow-x-auto">
            {businesses.map((b) => (
              <div key={b.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-neutral-900 text-sm">{b.name}</h4>
                    <span className="font-mono text-[11px] bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded">
                      {b.id}
                    </span>
                    <span
                      className={`font-mono text-[10px] px-2 py-0.5 rounded font-semibold uppercase ${
                        b.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700'
                          : b.status === 'hidden_unpaid'
                          ? 'bg-amber-50 text-amber-700'
                          : b.status === 'suspended' || b.status === 'rejected'
                          ? 'bg-red-50 text-red-700'
                          : 'bg-neutral-100 text-neutral-600'
                      }`}
                    >
                      {b.status.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="text-neutral-500 flex flex-wrap items-center gap-2">
                    <span>Category: {b.category}</span>
                    <span aria-hidden="true">·</span>
                    <span>Owner: {b.ownerEmail}</span>
                    <span aria-hidden="true">·</span>
                    <span>Paid Through: {b.billing?.paidThroughDate ? new Date(b.billing.paidThroughDate).toLocaleDateString() : 'Unpaid'}</span>
                  </div>

                  {b.statusReason && (
                    <p className="text-[11px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded inline-block mt-1">
                      Reason: {b.statusReason}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => onOpenProfile(b.id)}
                    className="py-1 px-2.5 bg-neutral-100 hover:bg-neutral-200 rounded text-neutral-700 transition-colors"
                  >
                    View
                  </button>

                  <button
                    onClick={() => {
                      setModTargetBusiness(b);
                      setModNewStatus('active');
                      setModReason('Approved upon administrative content review.');
                    }}
                    className="py-1 px-2.5 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 rounded transition-colors"
                  >
                    Approve
                  </button>

                  <button
                    onClick={() => {
                      setModTargetBusiness(b);
                      setModNewStatus('paused');
                      setModReason('Listing paused for administrative verification.');
                    }}
                    className="py-1 px-2.5 bg-amber-50 text-amber-800 hover:bg-amber-100 rounded transition-colors"
                  >
                    Pause
                  </button>

                  <button
                    onClick={() => {
                      setModTargetBusiness(b);
                      setModNewStatus('suspended');
                      setModReason('Policy violation or report investigation.');
                    }}
                    className="py-1 px-2.5 bg-red-50 text-red-800 hover:bg-red-100 rounded transition-colors"
                  >
                    Suspend
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Moderation Reason Modal */}
      {modTargetBusiness && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-xs">
          <div className="relative w-full max-w-md bg-white rounded-xl shadow-xl border border-neutral-200 p-6">
            <h3 className="text-base font-semibold text-neutral-900 font-display">
              Change Listing Status
            </h3>
            <p className="text-xs text-neutral-500 mt-1">
              Transitioning <strong>{modTargetBusiness.name}</strong> to <strong className="uppercase">{modNewStatus}</strong>.
              A recorded moderation reason is mandatory.
            </p>

            <form onSubmit={handleModerationSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Target Status</label>
                <select
                  value={modNewStatus}
                  onChange={(e) => setModNewStatus(e.target.value as ListingStatus)}
                  className="w-full text-xs p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-900"
                >
                  <option value="active">Active (Publicly Visible)</option>
                  <option value="paused">Paused</option>
                  <option value="hidden_unpaid">Hidden Unpaid</option>
                  <option value="suspended">Suspended (Blocked)</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Audit Reason (Required) *</label>
                <textarea
                  required
                  rows={3}
                  value={modReason}
                  onChange={(e) => setModReason(e.target.value)}
                  placeholder="State the administrative reason for this status change..."
                  className="w-full text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModTargetBusiness(null)}
                  className="py-2 px-3 text-xs font-medium text-neutral-600 hover:text-neutral-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modSubmitting}
                  className="py-2 px-4 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors"
                >
                  {modSubmitting ? 'Recording...' : 'Apply Status Change'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 2: CATEGORIES & KEYWORDS */}
      {activeTab === 'categories' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-neutral-200 p-6 space-y-6">
            <h3 className="text-sm font-semibold text-neutral-900 font-display">
              Manage Categories & Suggested Keywords
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {categories.map((c) => (
                <div key={c.id} className="p-4 bg-neutral-50 border border-neutral-200 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-neutral-900 text-sm">{c.name}</h4>
                    <span className="font-mono text-[10px] text-neutral-400">ID: {c.id}</span>
                  </div>
                  <p className="text-xs text-neutral-600">{c.description}</p>
                  {c.requiresMenu && (
                    <span className="inline-block text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      Requires menu before publication
                    </span>
                  )}

                  <div className="pt-2">
                    <span className="text-[11px] font-medium text-neutral-700 block mb-1">
                      Suggested Keywords:
                    </span>
                    <div className="flex flex-wrap gap-1 text-[11px]">
                      {c.suggestedKeywords.map((sk) => (
                        <span key={sk} className="bg-white border border-neutral-200 px-2 py-0.5 rounded text-neutral-600">
                          {sk}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Add Category Form */}
            <form onSubmit={handleAddCategory} className="pt-6 border-t border-neutral-100 space-y-4">
              <h4 className="text-xs font-semibold text-neutral-800">Add New Category</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-medium text-neutral-700 mb-1">Category Name *</label>
                  <input
                    type="text"
                    required
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="e.g. Wellness & Spa"
                    className="w-full text-xs p-2 bg-white border border-neutral-200 rounded-lg text-neutral-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-neutral-700 mb-1">Category ID *</label>
                  <input
                    type="text"
                    required
                    value={newCatId}
                    onChange={(e) => setNewCatId(e.target.value)}
                    placeholder="e.g. wellness-spa"
                    className="w-full text-xs p-2 bg-white border border-neutral-200 rounded-lg text-neutral-900 font-mono"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-medium text-neutral-700 mb-1">Suggested Keywords (Comma-separated)</label>
                  <input
                    type="text"
                    value={newCatKeywords}
                    onChange={(e) => setNewCatKeywords(e.target.value)}
                    placeholder="massage, sauna, facial, acupuncture, holistic health"
                    className="w-full text-xs p-2 bg-white border border-neutral-200 rounded-lg text-neutral-900"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="py-2 px-4 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors"
              >
                Create Category
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 3: COMMUNITY REPORTS */}
      {activeTab === 'reports' && (
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
          <div className="p-4 border-b border-neutral-100">
            <h3 className="text-sm font-semibold text-neutral-900 font-display">User Reports & Moderation Queue</h3>
          </div>
          {reports.length === 0 ? (
            <div className="p-8 text-center text-neutral-500 text-xs">
              No reports currently queued. All directory listings and flyers in nominal status.
            </div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {reports.map((rep) => (
                <div key={rep.id} className="p-4 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-neutral-900">{rep.businessName} ({rep.businessId})</span>
                    <span className="font-mono text-[10px] text-neutral-400">{rep.timestamp}</span>
                  </div>
                  <p className="text-neutral-700 font-medium">Reason: {rep.reason}</p>
                  {rep.details && <p className="text-neutral-500 bg-neutral-50 p-2 rounded">{rep.details}</p>}
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-[11px] text-neutral-400">Reporter: {rep.reporterEmail}</span>
                    {rep.status === 'pending' ? (
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            await fetch(`/api/reports/${rep.id}/resolve`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ status: 'resolved' }),
                            });
                            await fetchAdminData();
                          }}
                          className="py-1 px-2.5 text-xs bg-emerald-50 text-emerald-800 rounded font-medium"
                        >
                          Mark Resolved
                        </button>
                        <button
                          onClick={async () => {
                            await fetch(`/api/reports/${rep.id}/resolve`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ status: 'dismissed' }),
                            });
                            await fetchAdminData();
                          }}
                          className="py-1 px-2.5 text-xs bg-neutral-100 text-neutral-600 rounded font-medium"
                        >
                          Dismiss
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] font-mono capitalize text-neutral-500">Status: {rep.status}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: CUSTOMER REVIEWS MODERATION */}
      {activeTab === 'reviews' && (
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-neutral-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 font-display">
                Customer Reviews Moderation
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Review reported content, manage spam, and hide reviews that violate Short Stack guidelines. Hidden reviews are automatically excluded from the public business rating calculation.
              </p>
            </div>
            <span className="font-mono text-xs bg-neutral-100 px-2.5 py-1 rounded text-neutral-600">
              {reviews.filter((r) => r.flaggedByOwner).length} Flagged · {reviews.length} Total
            </span>
          </div>

          {reviews.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-500">
              No customer reviews found in the directory.
            </div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {reviews.map((rev) => {
                const targetBiz = businesses.find((b) => b.id === rev.businessId);
                return (
                  <div key={rev.id} className="p-4 sm:p-5 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-neutral-900 text-xs">
                            {targetBiz ? targetBiz.name : rev.businessId}
                          </span>
                          <span className="font-mono text-[11px] text-neutral-400">({rev.businessId})</span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-mono font-semibold uppercase ${
                              rev.status === 'published'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-red-50 text-red-700'
                            }`}
                          >
                            {rev.status}
                          </span>
                          {rev.flaggedByOwner && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-semibold flex items-center gap-1">
                              <Flag className="w-3 h-3" />
                              Flagged by Owner
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-xs text-neutral-500 mt-1">
                          <div className="flex items-center text-amber-500">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                className={`w-3 h-3 ${
                                  s <= rev.rating ? 'fill-amber-400 text-amber-400' : 'text-neutral-200'
                                }`}
                              />
                            ))}
                          </div>
                          <span>by <strong>{rev.reviewerName}</strong></span>
                          <span>·</span>
                          <span>{new Date(rev.createdAt).toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleReviewStatus(rev.id, rev.status)}
                          className={`py-1.5 px-3 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                            rev.status === 'published'
                              ? 'bg-neutral-100 hover:bg-neutral-200 text-red-700'
                              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          }`}
                        >
                          {rev.status === 'published' ? (
                            <>
                              <EyeOff className="w-3.5 h-3.5" />
                              <span>Hide Review</span>
                            </>
                          ) : (
                            <>
                              <Eye className="w-3.5 h-3.5" />
                              <span>Restore Review</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {rev.flagReason && (
                      <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
                        <strong>Owner Flag Note:</strong> {rev.flagReason}
                      </div>
                    )}

                    {rev.comment && (
                      <p className="text-xs text-neutral-700 bg-neutral-50 p-3 rounded-lg border border-neutral-100">
                        "{rev.comment}"
                      </p>
                    )}

                    {rev.adminNotes && (
                      <p className="text-[11px] text-neutral-500 italic">
                        Admin Note: {rev.adminNotes}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: ADVERTISING FEE & PAYMENTS */}
      {activeTab === 'payments' && (
        <div className="bg-white rounded-xl border border-neutral-200 p-6 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 font-display">
                Advertising Fee & Paid Renewal Terms
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                $19.99 initial enrollment fee, followed by $25 renewal fee every 2 months (or $12.50 with qualifying 50% referral discount). Manual renewals only.
              </p>
            </div>
            <div className="text-right">
              <span className="text-xl font-bold font-display text-neutral-900 tabular-nums">$19.99 / $25</span>
              <span className="text-[10px] text-neutral-400 block font-mono">Enrollment / Bimonthly</span>
            </div>
          </div>

          <div className="divide-y divide-neutral-100">
            {businesses.map((b) => (
              <div key={b.id} className="py-3.5 flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold text-neutral-900">{b.name}</span>
                  <span className="text-neutral-400 ml-2 font-mono">({b.id})</span>
                  <div className="flex flex-wrap items-center gap-3 text-neutral-500 text-[11px] mt-1">
                    <span>Enrollment Paid: <strong className="text-neutral-700">{b.billing?.isInitialSignUpPaid ? 'Yes ($19.99)' : 'No'}</strong></span>
                    <span>Renewal: <strong className="text-neutral-700">{b.billing?.hasReferralDiscount ? '$12.50 (50% Off)' : '$25/2-mo'}</strong></span>
                    <span>Paid Through: <strong className="text-neutral-700">{b.billing?.paidThroughDate ? new Date(b.billing.paidThroughDate).toLocaleDateString() : 'Unpaid'}</strong></span>
                    <span>Referral Code: <strong className="font-mono text-neutral-700">{b.referralCode || b.billing?.referralCode || '—'}</strong></span>
                  </div>
                </div>

                <span
                  className={`font-mono text-[10px] px-2 py-0.5 rounded font-semibold uppercase ${
                    b.billing?.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {b.billing?.status || 'unpaid'}
                </span>
              </div>
            ))}
          </div>

          {/* Referral & Reward Incentive Oversight */}
          <div className="pt-6 border-t border-neutral-100 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-neutral-900 font-display">
                  Referral & Reward Oversight
                </h4>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Track qualifying referrals, 50% renewal discount availability, and redemption status across all accounts.
                </p>
              </div>
              <span className="text-xs font-mono bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-medium">
                {referralsList.length} Referral Record(s)
              </span>
            </div>

            {referralsList.length === 0 ? (
              <p className="text-xs text-neutral-400 py-3 italic">
                No referral invitations or redemptions recorded yet. Business owners can share their unique referral code to earn 50% off their first renewal ($12.50).
              </p>
            ) : (
              <div className="border border-neutral-200 rounded-lg overflow-hidden divide-y divide-neutral-100 text-xs">
                {referralsList.map((refItem) => (
                  <div key={refItem.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-neutral-900">Referred: {refItem.referredBusinessName}</span>
                        <span className="font-mono text-[11px] text-neutral-400">({refItem.referredBusinessId})</span>
                      </div>
                      <p className="text-[11px] text-neutral-500 mt-0.5">
                        Referrer: {refItem.referrerOwnerEmail} (ID: {refItem.referrerBusinessId})
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-neutral-400 font-mono">
                        {new Date(refItem.createdAt).toLocaleDateString()}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                          refItem.status === 'qualified_discount_available'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : refItem.status === 'discount_redeemed'
                            ? 'bg-neutral-100 text-neutral-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {refItem.status === 'qualified_discount_available'
                          ? '50% Discount Ready ($12.50)'
                          : refItem.status === 'discount_redeemed'
                          ? 'Discount Redeemed'
                          : 'Pending Enrollment'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: AUDIT HISTORY LEDGER */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
          <div className="p-4 border-b border-neutral-100">
            <h3 className="text-sm font-semibold text-neutral-900 font-display">Audit History & Moderation Events</h3>
          </div>
          <div className="divide-y divide-neutral-100">
            {auditEvents.map((evt) => (
              <div key={evt.id} className="p-3.5 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-neutral-900 font-mono">{evt.action}</span>
                  <span className="text-[10px] font-mono text-neutral-400">{new Date(evt.timestamp).toLocaleString()}</span>
                </div>
                <p className="text-neutral-600">{evt.details}</p>
                <div className="flex items-center gap-3 text-[11px] text-neutral-400">
                  <span>Actor: {evt.actor}</span>
                  <span>Target: {evt.targetId}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: LOCAL PROMOTIONS OVERSIGHT */}
      {activeTab === 'promotions' && (
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-neutral-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 font-display">Local Promotions Oversight</h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Inspect active promotional flyers, headline discounts, and special offers across all business listings.
              </p>
            </div>
            <span className="text-xs font-mono bg-neutral-100 px-2.5 py-1 rounded text-neutral-600">
              {promotionsList.length} Active Flyers
            </span>
          </div>

          {promotionsList.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-500">
              No business promotions or flyers currently published.
            </div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {promotionsList.map((p) => (
                <div key={p.businessId} className="p-4 sm:p-5 flex flex-col sm:flex-row items-start justify-between gap-4 text-xs">
                  <div className="space-y-1 max-w-xl">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-neutral-900 text-sm">{p.businessName}</span>
                      <span className="font-mono text-[10px] bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded">
                        {p.businessId}
                      </span>
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold uppercase">
                        {p.flyer?.status || 'draft'}
                      </span>
                    </div>
                    <h4 className="font-bold text-neutral-900">{p.flyer?.headline}</h4>
                    <p className="text-neutral-600">{p.flyer?.offerDetails}</p>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <button
                      onClick={() => onOpenProfile(p.businessId)}
                      className="py-1 px-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded font-medium transition-colors"
                    >
                      View Profile
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: OWNERS & ACCOUNTS OVERSIGHT */}
      {activeTab === 'owners' && (
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-neutral-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 font-display">Owner & Account Oversight</h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Administrative view of registered platform accounts and associated business counts. Private owner contact information is isolated and protected.
              </p>
            </div>
            <span className="text-xs font-mono bg-neutral-100 px-2.5 py-1 rounded text-neutral-600">
              {usersList.length} Accounts
            </span>
          </div>

          <div className="divide-y divide-neutral-100 overflow-x-auto">
            {usersList.map((u) => (
              <div key={u.id} className="p-4 flex items-center justify-between gap-4 text-xs">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-neutral-900">{u.name}</span>
                    <span className="font-mono text-[11px] text-neutral-400">({u.email})</span>
                    <span className={`font-mono text-[10px] px-2 py-0.5 rounded uppercase font-semibold ${
                      u.role === 'admin' ? 'bg-purple-50 text-purple-700' : 'bg-neutral-100 text-neutral-700'
                    }`}>
                      {u.role}
                    </span>
                  </div>
                  <div className="text-neutral-500 text-[11px]">
                    Associated Businesses: <strong>{u.businessesCount || 0}</strong> · Registered: {new Date(u.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 6: SYSTEM INTEGRATIONS */}
      {activeTab === 'integrations' && systemStatus && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-neutral-200 p-6 space-y-4">
            <h3 className="text-sm font-semibold text-neutral-900 font-display">System Integration Boundaries</h3>
            <p className="text-xs text-neutral-500">
              Clear status transparency for platform external services. No simulated features pretend to be live.
            </p>

            <div className="space-y-3 pt-2">
              {Object.entries(systemStatus.integrations || {}).map(([key, info]: [string, any]) => (
                <div key={key} className="p-4 bg-neutral-50 border border-neutral-200 rounded-lg space-y-2 text-xs">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="font-semibold uppercase tracking-wider font-mono text-neutral-900">
                        {key} Integration
                      </span>
                      <p className="text-neutral-600 mt-1">{info.detail}</p>
                    </div>
                    <span
                      className={`font-mono text-[10px] px-2 py-0.5 rounded font-semibold shrink-0 uppercase ${
                        info.status === 'live' || info.status === 'active_local'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {info.status}
                    </span>
                  </div>

                  {info.setupRequired && (
                    <div className="p-2.5 bg-amber-50/70 border border-amber-200/60 rounded text-[11px] text-amber-900">
                      <span className="font-semibold">Required Setup: </span>
                      <span>{info.setupRequired}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
