import React, { useState, useEffect } from 'react';
import { X, UserPlus, Users, Trash2, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import type { MonitoredUser } from '../types.js';

interface MonitoredUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserSelect: (username: string) => void;
}

export const MonitoredUsersModal: React.FC<MonitoredUsersModalProps> = ({
  isOpen,
  onClose,
  onUserSelect
}) => {
  const [users, setUsers] = useState<MonitoredUser[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch {
      // ignore fetch error
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) return;

    setLoading(true);
    setStatusMsg(null);

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername.trim() })
      });

      if (res.ok) {
        const data = await res.json();
        setUsers((prev) => [data.user, ...prev]);
        setNewUsername('');
        setStatusMsg({ type: 'success', text: `Added @${data.user.username} to live polling stream!` });
      } else {
        const err = await res.json();
        setStatusMsg({ type: 'error', text: err.error || 'Failed to add user' });
      }
    } catch {
      setStatusMsg({ type: 'error', text: 'Network request failed' });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveUser = async (username: string) => {
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(username)}`, { method: 'DELETE' });
      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.username !== username));
      }
    } catch {
      // ignore
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col text-slate-100 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Monitored Last.fm Users</h2>
              <p className="text-xs text-slate-400">Add any Last.fm username to watch their real-time scrobbles</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Add User Form */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/40">
          <form onSubmit={handleAddUser} className="flex gap-2">
            <input
              id="add-username-input"
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="e.g. your_lastfm_username"
              className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono"
            />
            <button
              id="submit-add-user-btn"
              type="submit"
              disabled={loading || !newUsername.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-md text-sm font-semibold transition-colors shrink-0"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add</span>
            </button>
          </form>

          {statusMsg && (
            <div
              className={`mt-2 text-xs flex items-center gap-1.5 ${
                statusMsg.type === 'success' ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {statusMsg.type === 'success' ? (
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>{statusMsg.text}</span>
            </div>
          )}
        </div>

        {/* Users List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Active Stream Pool ({users.length})
          </div>

          {users.map((u) => (
            <div
              key={u.username}
              className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/50 hover:bg-slate-800 transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src={`https://api.dicebear.com/7.x/identicon/svg?seed=${u.username}`}
                  alt={u.username}
                  className="w-7 h-7 rounded-full bg-slate-700 border border-slate-600 shrink-0"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        onUserSelect(u.username);
                        onClose();
                      }}
                      className="font-mono text-sm font-medium text-slate-200 hover:text-sky-400 hover:underline truncate text-left"
                      title="Filter feed by this user"
                    >
                      @{u.username}
                    </button>
                    {u.isCustom && (
                      <span className="text-[10px] bg-sky-950 text-sky-400 border border-sky-800/80 px-1.5 py-0.2 rounded font-sans">
                        custom
                      </span>
                    )}
                  </div>
                  {u.currentTrack && (
                    <p className="text-[11px] text-slate-400 truncate max-w-xs">
                      {u.currentTrack}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={`https://www.last.fm/user/${u.username}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="p-1 text-slate-400 hover:text-white"
                  title="View on Last.fm"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                {u.isCustom && (
                  <button
                    onClick={() => handleRemoveUser(u.username)}
                    className="p-1 text-slate-400 hover:text-rose-400"
                    title="Remove user"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 text-xs text-slate-400 flex items-center justify-between">
          <span>Official Last.fm Audioscrobbler Web Services Integration</span>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
