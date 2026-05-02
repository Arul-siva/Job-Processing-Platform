import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { Activity, Plus, Server, RefreshCcw, CheckCircle2, XCircle, AlertCircle, LogOut } from 'lucide-react';

const SERVER_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [username, setUsername] = useState('');
  
  const [jobs, setJobs] = useState([]);
  const [type, setType] = useState('');
  const [payload, setPayload] = useState('{"task": "process_data"}');
  const [priority, setPriority] = useState('medium');
  const [filter, setFilter] = useState('all');
  
  const [selectedJob, setSelectedJob] = useState(null);

  useEffect(() => {
    if (!token) return;

    fetchJobs();

    // Initialize socket connection explicitly inside effect to survive strict mode and module reloads
    const socket = io(SERVER_URL, {
      auth: { token },
      forceNew: true
    });

    const handleJobUpdate = (updatedJob) => {
      setJobs((prev) => {
        const index = prev.findIndex(j => j._id === updatedJob._id);
        if (index > -1) {
          const newJobs = [...prev];
          newJobs[index] = updatedJob;
          return newJobs;
        }
        return [updatedJob, ...prev];
      });
      
      // Update selected job if it is currently being viewed
      setSelectedJob((prev) => {
        if (prev && prev._id === updatedJob._id) return updatedJob;
        return prev;
      });
    };

    socket.on('job_created', handleJobUpdate);
    socket.on('job_processing', handleJobUpdate);
    socket.on('job_completed', handleJobUpdate);
    socket.on('job_failed', handleJobUpdate);
    socket.on('job_retry', handleJobUpdate);

    return () => {
      socket.disconnect();
    }
  }, [token]);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${SERVER_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });
      const data = await res.json();
      if (data.token) {
        localStorage.setItem('token', data.token);
        setToken(data.token);
      }
    } catch (err) {
      alert('Login failed');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken('');
    setJobs([]);
  };

  const fetchJobs = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/jobs`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) setJobs(data);
    } catch (err) {
      console.error('Failed to fetch jobs', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${SERVER_URL}/job`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          type,
          payload: JSON.parse(payload),
          priority
        })
      });
      
      if (res.status === 429) {
        alert('Rate limit exceeded: You have submitted too many jobs recently.');
        return;
      }
      
      if (res.ok) {
        setType('');
        setPayload('{\n  "task": "new_task"\n}');
      } else {
        const d = await res.json();
        alert(d.error || 'Failed to submit job.');
      }
    } catch (err) {
      alert('Failed to submit job. Make sure payload is valid JSON.');
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl w-full max-w-sm shadow-2xl">
          <div className="flex justify-center mb-6">
            <div className="p-3 bg-indigo-500/10 rounded-xl">
              <Server className="w-8 h-8 text-indigo-400" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-white text-center mb-2">Job Platform</h2>
          <p className="text-slate-500 text-center mb-8">Sign in to manage your jobs</p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-400 tracking-wider uppercase">Username</label>
              <input 
                type="text" 
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter any username"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-slate-200 focus:outline-none focus:border-indigo-500 mt-1"
                required
              />
            </div>
            <button className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-medium py-3 rounded-lg transition-all active:scale-[0.98]">
              Proceed
            </button>
          </form>
        </div>
      </div>
    );
  }

  const filteredJobs = jobs.filter(job => filter === 'all' || job.status === filter);

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
      case 'processing': return <RefreshCcw className="w-5 h-5 text-blue-400 animate-spin" />;
      case 'failed': case 'dead-letter': return <XCircle className="w-5 h-5 text-red-500" />;
      default: return <AlertCircle className="w-5 h-5 text-yellow-500" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'processing': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'failed': case 'dead-letter': return 'bg-red-500/10 text-red-500 border-red-500/20';
      default: return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 font-sans p-6 selection:bg-indigo-500/30">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex items-center justify-between pb-6 border-b border-slate-800">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-indigo-500/10 rounded-lg">
              <Server className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">Distributed Job Platform</h1>
              <p className="text-slate-500 text-sm">Real-time asynchronous job processing</p>
            </div>
          </div>
          <div className="flex flex-col md:flex-row items-end md:items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 rounded-full border border-slate-800 text-sm font-medium">
              <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span className="text-emerald-400 hidden md:inline">System Online</span>
            </div>
            <button onClick={handleLogout} className="flex items-center gap-2 text-slate-400 hover:text-red-400 transition-colors text-sm font-medium">
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Dashboard */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h2 className="text-xl font-semibold text-white">Live Dashboard</h2>
              <div className="flex flex-wrap gap-2 bg-slate-900 p-1 rounded-lg border border-slate-800">
                {['all', 'pending', 'processing', 'completed', 'dead-letter'].map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      filter === f 
                        ? 'bg-indigo-500 text-white shadow-lg' 
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              {filteredJobs.length === 0 && (
                <div className="p-8 text-center border overflow-hidden border-slate-800 border-dashed rounded-xl bg-slate-900/50">
                  <p className="text-slate-500">No jobs found in this category.</p>
                </div>
              )}
              {filteredJobs.map((job) => (
                <div 
                  key={job._id} 
                  onClick={() => setSelectedJob(job)}
                  className="group relative bg-slate-900 border border-slate-800 p-5 rounded-xl transition-all cursor-pointer hover:border-indigo-500/50 hover:shadow-xl hover:shadow-indigo-500/5"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="mt-1">
                        {getStatusIcon(job.status)}
                      </div>
                      <div>
                        <h3 className="text-white font-medium text-lg leading-tight">{job.type}</h3>
                        <p className="text-slate-500 text-sm mt-1">ID: <span className="font-mono text-xs bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">{job._id}</span></p>
                      </div>
                    </div>
                    <div className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusColor(job.status)}`}>
                      {job.status.toUpperCase()}
                    </div>
                  </div>
                  
                  <div className="mt-4 grid grid-cols-3 gap-4">
                    <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/50">
                      <p className="text-slate-500 text-xs mb-1 uppercase tracking-wider font-semibold">Priority</p>
                      <p className="text-slate-200 font-medium capitalize">{job.priority}</p>
                    </div>
                    <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/50">
                      <p className="text-slate-500 text-xs mb-1 uppercase tracking-wider font-semibold">Retries</p>
                      <p className="text-slate-200 font-medium">{job.retries} <span className="text-slate-600 text-xs">/ {job.maxRetries}</span></p>
                    </div>
                    <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/50">
                      <p className="text-slate-500 text-xs mb-1 uppercase tracking-wider font-semibold">Created</p>
                      <p className="text-slate-200 font-medium">{new Date(job.createdAt).toLocaleTimeString()}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sidebar / Submission */}
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl sticky top-6">
              <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-400" />
                Submit New Job
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-400 tracking-wider uppercase">Job Type</label>
                  <input 
                    type="text" 
                    value={type}
                    onChange={e => setType(e.target.value)}
                    placeholder="e.g. process_video"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-slate-700"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-400 tracking-wider uppercase">Priority</label>
                  <select 
                    value={priority}
                    onChange={e => setPriority(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all appearance-none"
                  >
                    <option value="high">High (1)</option>
                    <option value="medium">Medium (5)</option>
                    <option value="low">Low (10)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-400 tracking-wider uppercase">Payload (JSON)</label>
                  <textarea 
                    value={payload}
                    onChange={e => setPayload(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-slate-300 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-mono text-sm h-32 resize-none"
                    required
                  />
                </div>

                <button 
                  type="submit"
                  className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-medium py-2.5 rounded-lg transition-all shadow-lg shadow-indigo-500/20 active:scale-[0.98]"
                >
                  Enqueue Job
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Detail View Modal */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-800">
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-3">
                  {selectedJob.type}
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStatusColor(selectedJob.status)}`}>
                    {selectedJob.status.toUpperCase()}
                  </span>
                </h3>
                <p className="text-slate-500 font-mono text-xs mt-1">{selectedJob._id}</p>
              </div>
              <button 
                onClick={() => setSelectedJob(null)}
                className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <p className="text-slate-500 text-xs uppercase font-semibold mb-1">Created</p>
                  <p className="text-white text-sm">{new Date(selectedJob.createdAt).toLocaleString()}</p>
                </div>
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <p className="text-slate-500 text-xs uppercase font-semibold mb-1">Updated</p>
                  <p className="text-white text-sm">{new Date(selectedJob.updatedAt).toLocaleString()}</p>
                </div>
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <p className="text-slate-500 text-xs uppercase font-semibold mb-1">Priority</p>
                  <p className="text-white text-sm capitalize">{selectedJob.priority}</p>
                </div>
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <p className="text-slate-500 text-xs uppercase font-semibold mb-1">Retries</p>
                  <p className="text-white text-sm">{selectedJob.retries} / {selectedJob.maxRetries}</p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">Payload View</h4>
                <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl overflow-x-auto">
                  <pre className="text-indigo-300 font-mono text-xs">
                    {JSON.stringify(selectedJob.payload, null, 2)}
                  </pre>
                </div>
              </div>

              {selectedJob.errorLog && selectedJob.errorLog.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400" /> Error Log
                  </h4>
                  <div className="space-y-2">
                    {selectedJob.errorLog.map((log, i) => (
                      <div key={i} className="bg-red-500/5 border border-red-500/10 p-3 rounded-lg flex items-start gap-3">
                        <span className="text-red-400 font-mono text-xs whitespace-nowrap mt-0.5">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        <span className="text-slate-300 text-sm">
                          {log.message}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
