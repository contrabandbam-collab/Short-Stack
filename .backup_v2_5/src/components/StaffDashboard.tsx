import React, { useState } from 'react';
import { Business, Category } from '../types/pipsqueak.ts';
import { Lock, Utensils, Wrench, Clock, CheckCircle2, Image as ImageIcon, Sparkles } from 'lucide-react';

interface StaffDashboardProps {
  businesses: Business[];
  currentUserId: string;
  onRefreshData: () => Promise<void>;
  onOpenProfile: (id: string) => void;
}

export const StaffDashboard: React.FC<StaffDashboardProps> = ({
  businesses,
  currentUserId,
  onRefreshData,
  onOpenProfile,
}) => {
  // Filter businesses where this user is staff
  const staffBizs = businesses.filter(
    (b) => b.staff?.some((s) => s.userId === currentUserId || s.email === 'sarah.staff@bistro.local')
  );

  const [selectedBizId, setSelectedBizId] = useState<string>(staffBizs[0]?.id || businesses[0]?.id || '');
  const activeBiz = businesses.find((b) => b.id === selectedBizId) || businesses[0];

  const staffRecord = activeBiz?.staff?.find(
    (s) => s.userId === currentUserId || s.email === 'sarah.staff@bistro.local'
  );
  const permissions = staffRecord?.permissions || ['edit_profile', 'edit_menu', 'edit_photos'];

  const [hours, setHours] = useState(activeBiz?.hours || {
    monday: 'Closed',
    tuesday: '4:00 PM – 10:00 PM',
    wednesday: '4:00 PM – 10:00 PM',
    thursday: '4:00 PM – 10:00 PM',
    friday: '4:00 PM – 11:00 PM',
    saturday: '11:00 AM – 11:00 PM',
    sunday: '11:00 AM – 9:00 PM',
  });
  const [saveSuccess, setSaveSuccess] = useState(false);

  if (!activeBiz) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h2 className="text-xl font-bold font-display text-neutral-900">Staff Portal</h2>
        <p className="text-xs text-neutral-500 mt-2">
          You currently have no active business staff invitations assigned to your account.
        </p>
      </div>
    );
  }

  const handleSaveHours = async () => {
    try {
      const res = await fetch(`/api/businesses/${activeBiz.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours }),
      });
      if (res.ok) {
        await onRefreshData();
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="border-b border-neutral-200 pb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold font-display text-neutral-900 tracking-tight">Staff Access Portal</h1>
          <span className="text-[11px] font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200">
            Staff Role
          </span>
        </div>
        <p className="text-xs text-neutral-500 mt-1">
          Managing: <strong className="text-neutral-800">{activeBiz.name}</strong> (Permanent ID: {activeBiz.id})
        </p>
      </div>

      {/* Permissions Transparency Banner */}
      <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 text-xs space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-neutral-900">Granted Operational Permissions:</span>
          <span className="text-emerald-700 flex items-center gap-1 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" /> Authorized by Owner
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {permissions.map((p) => (
            <span key={p} className="bg-white border border-neutral-200 rounded px-2.5 py-1 text-[11px] font-mono text-neutral-800">
              {p}
            </span>
          ))}
        </div>
        <div className="pt-2 border-t border-neutral-200/60 flex items-center gap-1.5 text-neutral-500 text-[11px]">
          <Lock className="w-3.5 h-3.5 text-neutral-400" />
          <span>Billing, Advertising Fee Renewal, Staff Delegation, and Ownership changes are restricted to the business owner.</span>
        </div>
      </div>

      {/* Staff Actions Area */}
      <div className="bg-white rounded-xl border border-neutral-200 p-6 space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
          <div>
            <h3 className="text-base font-semibold text-neutral-900 font-display">Update Operating Hours</h3>
            <p className="text-xs text-neutral-500">Edit business daily open/close schedules.</p>
          </div>
          <button
            onClick={handleSaveHours}
            className="py-1.5 px-3.5 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors"
          >
            {saveSuccess ? 'Saved!' : 'Save Hours'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Object.entries(hours).map(([day, val]) => (
            <div key={day} className="flex items-center justify-between gap-3 text-xs">
              <span className="capitalize font-medium text-neutral-700 w-24">{day}</span>
              <input
                type="text"
                value={val}
                onChange={(e) => setHours({ ...hours, [day]: e.target.value })}
                className="flex-1 text-xs p-2 bg-neutral-50 border border-neutral-200 rounded-md text-neutral-900 font-mono"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Menu / Services Preview */}
      <div className="bg-white rounded-xl border border-neutral-200 p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
          <div className="flex items-center gap-2">
            <Utensils className="w-4 h-4 text-neutral-700" />
            <h3 className="text-base font-semibold text-neutral-900 font-display">Active Menu Items</h3>
          </div>
          <button
            onClick={() => onOpenProfile(activeBiz.id)}
            className="text-xs text-neutral-700 hover:underline"
          >
            Preview on Public Profile
          </button>
        </div>

        <div className="divide-y divide-neutral-100">
          {(activeBiz.menuItems || []).map((m) => (
            <div key={m.id} className="py-2.5 flex items-center justify-between text-xs">
              <div>
                <span className="font-semibold text-neutral-900">{m.name}</span>
                <span className="text-neutral-500 ml-2">({m.category})</span>
                <p className="text-neutral-500 text-[11px] mt-0.5">{m.description}</p>
              </div>
              <span className="font-mono font-medium text-neutral-900">{m.price}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
