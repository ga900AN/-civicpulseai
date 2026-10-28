import { useEffect, useState } from 'react'
import {
  Activity, AlertCircle, ArrowRight, ArrowUpRight, Bell, Bot, Building2,
  CalendarDays, Check, CheckCircle2, ChevronRight, Clock3, FileText, Gauge,
  ImagePlus, Lightbulb, LocateFixed, MapPin, Menu, Plus, Search, Send, Settings,
  ShieldCheck, Sparkles, Trash2, UserRound, Waves, X,
} from 'lucide-react'
import './CitizenPortal.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'
const CATEGORIES = ['Roads', 'Waste', 'Streetlights', 'Water', 'Drainage', 'Public Safety', 'Other']
const STATUSES = ['Submitted', 'Under Review', 'In Progress', 'Resolved', 'Rejected']
const MAX_PHOTO_SIZE = 5 * 1024 * 1024
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const NAV_ITEMS = [
  { name: 'Overview', icon: Gauge },
  { name: 'My Reports', icon: FileText },
  { name: 'Report an Issue', icon: Plus },
  { name: 'Track Complaint', icon: LocateFixed },
  { name: 'AI Assistant', icon: Sparkles, badge: 'AI' },
  { name: 'Civic Services', icon: ShieldCheck },
  { name: 'Nearby Help', icon: MapPin },
  { name: 'Analytics', icon: Activity },
  { name: 'Admin Dashboard', icon: Building2 },
  { name: 'Notifications', icon: Bell },
  { name: 'Profile & Settings', icon: Settings },
]
const SERVICES = [
  { title: 'Roads & footpaths', category: 'Roads', description: 'Report potholes, damaged sidewalks, and unsafe road conditions.', icon: LocateFixed, color: 'blue' },
  { title: 'Waste & sanitation', category: 'Waste', description: 'Flag missed pickups, overflowing bins, and illegal dumping.', icon: Trash2, color: 'green' },
  { title: 'Water & drainage', category: 'Water', description: 'Report leaks, water supply problems, and blocked drains.', icon: Waves, color: 'aqua' },
  { title: 'Street lighting', category: 'Streetlights', description: 'Let the city know about dark streets and faulty lamps.', icon: Lightbulb, color: 'amber' },
]

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || 'The request could not be completed.')
  return data
}

function formatDate(value, dateOnly = false) {
  if (!value) return 'Just now'
  return new Intl.DateTimeFormat('en-IN', dateOnly
    ? { month: 'short', day: 'numeric', year: 'numeric' }
    : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function statusClass(status = '') {
  return `status-${status.toLowerCase().replaceAll(' ', '-')}`
}

function StatusPill({ status }) {
  return <span className={`status-pill ${statusClass(status)}`}>{status}</span>
}

function ReportTable({ reports, onSelect, onStatusChange, admin = false }) {
  if (!reports.length) return <div className="portal-empty"><FileText size={22} /><strong>No reports yet</strong><span>Reports from your community will appear here.</span></div>
  return (
    <div className="table-scroll">
      <table className="reports-table">
        <thead><tr><th>Report</th><th>Category</th><th>Status</th>{admin && <th>Priority</th>}<th>{admin ? 'Update' : 'Action'}</th></tr></thead>
        <tbody>{reports.map((report) => (
          <tr key={report.id}>
            <td><button className="table-report-link" onClick={() => onSelect(report)}><strong>{report.title}</strong><small>{report.id} · {report.location} · {formatDate(report.createdAt, true)}</small></button></td>
            <td>{report.category}</td>
            <td><StatusPill status={report.status} /></td>
            {admin && <td>{report.status === 'Submitted' ? 'New' : report.status === 'Resolved' ? 'Closed' : 'Active'}</td>}
            <td>{admin
              ? <select className="table-status-select" value={report.status} aria-label={`Update status for ${report.id}`} onChange={(event) => onStatusChange(report, event.target.value)}>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select>
              : <button className="table-action" onClick={() => onSelect(report)}>View details <ArrowRight size={13} /></button>}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

function CitizenPortal() {
  const [view, setView] = useState('Overview')
  const [menuOpen, setMenuOpen] = useState(false)
  const [reports, setReports] = useState([])
  const [analytics, setAnalytics] = useState({ total: 0, open: 0, resolved: 0, byCategory: {}, byStatus: {} })
  const [notifications, setNotifications] = useState([])
  const [selectedReport, setSelectedReport] = useState(null)
  const [query, setQuery] = useState('')
  const [trackId, setTrackId] = useState('')
  const [trackedReport, setTrackedReport] = useState(null)
  const [trackError, setTrackError] = useState('')
  const [aiText, setAiText] = useState('')
  const [aiResult, setAiResult] = useState(null)
  const [aiReady, setAiReady] = useState(false)
  const [profile, setProfile] = useState(() => {
    try { return JSON.parse(localStorage.getItem('civicpulse-profile')) || { name: 'Citizen', city: 'Mumbai, Maharashtra' } }
    catch { return { name: 'Citizen', city: 'Mumbai, Maharashtra' } }
  })
  const [form, setForm] = useState({ title: '', description: '', category: 'Roads', location: '', citizenName: profile.name === 'Citizen' ? '' : profile.name })
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [photoError, setPhotoError] = useState('')
  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  async function loadDashboard() {
    setLoading(true)
    setError('')
    try {
      const [reportData, analyticsData, notificationData, healthData] = await Promise.all([
        request('/api/complaints'), request('/api/analytics'), request('/api/notifications'), request('/api/health'),
      ])
      setReports(reportData.reports || [])
      setAnalytics(analyticsData)
      setNotifications(notificationData.notifications || [])
      setAiReady(Boolean(healthData.gemini))
      setSelectedReport((current) => current ? (reportData.reports || []).find((item) => item.id === current.id) || current : null)
    } catch (requestError) {
      setError(`${requestError.message} Check that the backend is running at ${API_URL}.`)
    } finally { setLoading(false) }
  }

  useEffect(() => { loadDashboard() }, [])

  useEffect(() => {
    if (!photo) {
      setPhotoPreview('')
      return undefined
    }

    const previewUrl = URL.createObjectURL(photo)
    setPhotoPreview(previewUrl)
    return () => URL.revokeObjectURL(previewUrl)
  }, [photo])

  function navigate(nextView) {
    setView(nextView)
    setMenuOpen(false)
    setNotice('')
    setError('')
    if (nextView !== 'Track Complaint') setTrackedReport(null)
  }

  function updateForm(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  function choosePhoto(file) {
    if (!file) return
    setPhotoError('')

    const hasSupportedExtension = /\.(jpe?g|png|webp)$/i.test(file.name)
    const hasSupportedType = PHOTO_TYPES.includes(file.type)
    if (!hasSupportedExtension || (file.type && !hasSupportedType)) {
      setPhotoError('Unsupported file type. Choose a JPG, JPEG, PNG, or WEBP image.')
      return
    }

    if (file.size > MAX_PHOTO_SIZE) {
      setPhotoError('This image is larger than 5 MB. Choose a smaller photo.')
      return
    }

    setPhoto(file)
  }

  function handlePhotoInput(event) {
    choosePhoto(event.target.files?.[0])
    event.target.value = ''
  }

  function handlePhotoDrop(event) {
    event.preventDefault()
    setIsDraggingPhoto(false)
    if (event.dataTransfer.files.length > 1) {
      setPhoto(null)
      setPhotoError('Only one photo can be uploaded at a time.')
      return
    }
    choosePhoto(event.dataTransfer.files?.[0])
  }

  async function submitReport(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const data = await request('/api/complaints', { method: 'POST', body: JSON.stringify(form) })
      setForm({ title: '', description: '', category: 'Roads', location: '', citizenName: profile.name === 'Citizen' ? '' : profile.name })
      const photoNotice = photo ? ' The photo preview was not included because image uploads are not supported yet.' : ''
      setPhoto(null)
      setSelectedReport(data.report)
      setNotice(`Report ${data.report.id} has been submitted.${photoNotice}`)
      await loadDashboard()
      setView('My Reports')
    } catch (requestError) { setError(requestError.message) }
    finally { setSaving(false) }
  }

  async function requestSuggestion(description, location = '') {
    if (String(description).trim().length < 8) {
      setError('Add a few more details so CivicPulse AI can help.')
      return null
    }
    setAiLoading(true)
    setError('')
    try {
      const data = await request('/api/ai/assist', { method: 'POST', body: JSON.stringify({ description, location }) })
      setAiResult(data.suggestion)
      setNotice(data.note || (data.source === 'Gemini' ? 'AI suggestions are ready. Review them before using.' : 'A local suggestion is ready. Review it before using.'))
      return data.suggestion
    } catch (requestError) { setError(requestError.message); return null }
    finally { setAiLoading(false) }
  }

  async function improveReport() {
    const suggestion = await requestSuggestion(form.description, form.location)
    if (suggestion) {
      setForm((current) => ({ ...current, title: suggestion.title || current.title, category: CATEGORIES.includes(suggestion.category) ? suggestion.category : current.category, description: suggestion.description || current.description }))
    }
  }

  async function askAssistant(event) {
    event?.preventDefault()
    const suggestion = await requestSuggestion(aiText, profile.city)
    if (suggestion) setAiText('')
  }

  async function trackComplaint(event) {
    event.preventDefault()
    setTrackError('')
    setTrackedReport(null)
    try {
      const data = await request(`/api/complaints/${encodeURIComponent(trackId.trim())}`)
      setTrackedReport(data.report)
    } catch (requestError) { setTrackError(requestError.message) }
  }

  async function changeStatus(report, status) {
    if (report.status === status) return
    try {
      await request(`/api/complaints/${encodeURIComponent(report.id)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
      setNotice(`${report.id} status updated to ${status}.`)
      await loadDashboard()
    } catch (requestError) { setError(requestError.message) }
  }

  async function markRead(notification) {
    try {
      await request(`/api/notifications/${encodeURIComponent(notification.id)}/read`, { method: 'PATCH' })
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read: true } : item))
    } catch (requestError) { setError(requestError.message) }
  }

  function applySuggestion() {
    if (!aiResult) return
    setForm((current) => ({ ...current, title: aiResult.title || current.title, description: aiResult.description || current.description, category: CATEGORIES.includes(aiResult.category) ? aiResult.category : current.category }))
    setView('Report an Issue')
    setNotice('AI suggestions added to your report. Review the details before submitting.')
    setAiResult(null)
  }

  function saveProfile(event) {
    event.preventDefault()
    localStorage.setItem('civicpulse-profile', JSON.stringify(profile))
    setForm((current) => ({ ...current, citizenName: profile.name === 'Citizen' ? '' : profile.name }))
    setNotice('Your profile settings have been saved on this device.')
  }

  const filteredReports = reports.filter((report) => `${report.id} ${report.title} ${report.category} ${report.location} ${report.status}`.toLowerCase().includes(query.toLowerCase()))
  const unreadCount = notifications.filter((item) => !item.read).length
  const today = new Intl.DateTimeFormat('en-IN', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())
  const maxCategory = Math.max(1, ...Object.values(analytics.byCategory || {}))

  const renderReportDetails = (report) => report && (
    <section className="portal-detail"><div className="portal-detail-top"><div><span className="section-kicker">REPORT DETAILS</span><h2>{report.id} <StatusPill status={report.status} /></h2></div><button className="close-button" onClick={() => setSelectedReport(null)} aria-label="Close report details"><X size={17} /></button></div><div className="detail-facts"><div><small>Issue</small><strong>{report.title}</strong></div><div><small>Location</small><strong>{report.location}</strong></div><div><small>Submitted</small><strong>{formatDate(report.createdAt, true)}</strong></div></div><p className="detail-description">{report.description}</p><div className="timeline-list">{(report.timeline || []).map((item, index) => <div className="timeline-item" key={`${item.at}-${index}`}><span className="timeline-dot" /><div><strong>{item.status}</strong><p>{item.note}</p><small>{formatDate(item.at)}</small></div></div>)}</div></section>
  )

  const renderReports = (list = filteredReports, admin = false) => <ReportTable reports={list} onSelect={setSelectedReport} onStatusChange={changeStatus} admin={admin} />

  const renderContent = () => {
    if (view === 'Overview') return (
      <>
        <section className="welcome-hero"><div className="hero-ring" /><span className="hero-label"><Sparkles size={13} /> YOUR VOICE. YOUR CITY. YOUR IMPACT.</span><h2>Better cities start <span>with you.</span></h2><p>Report local issues, track your reports and use AI to turn civic concerns into clear, actionable complaints.</p><div className="hero-actions"><button className="button button-aqua" onClick={() => navigate('Report an Issue')}><Plus size={16} /> Report an issue <ArrowRight size={15} /></button><button className="button button-hero-secondary" onClick={() => navigate('AI Assistant')}><Bot size={16} /> Ask CivicPulse AI</button></div><div className="hero-facts"><div><strong>24/7</strong><small>Access</small></div><div><strong>AI</strong><small>Assistance</small></div><div><strong>You</strong><small>Make change</small></div></div></section>
        <section className="portal-metrics"><article className="portal-metric"><span className="metric-symbol blue"><FileText size={17} /></span><ArrowUpRight className="metric-trend" size={14} /><small>Total reports</small><strong>{analytics.total}</strong><span>In this community</span></article><article className="portal-metric"><span className="metric-symbol amber"><Clock3 size={17} /></span><ArrowUpRight className="metric-trend" size={14} /><small>In progress</small><strong>{analytics.open}</strong><span>Being addressed</span></article><article className="portal-metric"><span className="metric-symbol green"><CheckCircle2 size={17} /></span><ArrowUpRight className="metric-trend" size={14} /><small>Resolved issues</small><strong>{analytics.resolved}</strong><span>Marked resolved</span></article><article className="portal-metric"><span className="metric-symbol violet"><Sparkles size={17} /></span><ArrowUpRight className="metric-trend" size={14} /><small>AI assistance</small><strong className="metric-word">Ready</strong><span>{aiReady ? 'Gemini-powered help' : 'Community guidance'}</span></article></section>
        <div className="overview-grid"><section className="portal-panel recent-panel"><div className="panel-heading"><div><h2>Recent reports</h2><p>A quick look at community issues</p></div><button className="inline-link" onClick={() => navigate('My Reports')}>View all <ArrowRight size={14} /></button></div><label className="portal-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reports..." /></label>{renderReports(filteredReports.slice(0, 5))}</section><section className="portal-panel assistant-panel"><div className="assistant-brand"><span className="assistant-avatar"><Bot size={19} /></span><div><strong>CivicPulse AI</strong><small>Your civic companion</small></div></div><div className="assistant-prompt"><div className="prompt-title"><Sparkles size={14} /><strong>What can I help with?</strong></div><p>Ask about civic problems or prepare a complaint.</p>{['How do I report a pothole?', 'Help me describe garbage issues', 'What details should I include?'].map((question) => <button className="suggestion-row" key={question} onClick={() => { setAiText(question); setView('AI Assistant'); setAiResult(null) }}>{question}<ChevronRight size={14} /></button>)}</div><button className="assistant-open" onClick={() => navigate('AI Assistant')}>Open AI Assistant <ArrowRight size={14} /></button></section></div>
      </>
    )

    if (view === 'My Reports') return <section className="portal-panel page-panel"><div className="panel-heading"><div><h2>My reports</h2><p>Track the issues you have sent to your community desk.</p></div><button className="button button-primary" onClick={() => navigate('Report an Issue')}><Plus size={15} /> New report</button></div><label className="portal-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by report ID, issue, category, or location" /></label>{renderReports()}</section>

    if (view === 'Report an Issue') return (
      <section className="portal-panel page-panel form-page">
        <div className="panel-heading"><div><h2>Report a community issue</h2><p>Share clear details so the right team can take action.</p></div></div>
        <form className="issue-form" onSubmit={submitReport}>
          <label>Issue title<input name="title" value={form.title} onChange={updateForm} placeholder="e.g. Streetlight out on Oak Avenue" required /></label>
          <label>Description<textarea name="description" value={form.description} onChange={updateForm} placeholder="What happened? Include useful details such as when it started and who is affected." rows="5" minLength="8" required /></label>
          <div className="form-two">
            <label>Category<select name="category" value={form.category} onChange={updateForm}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
            <label>Location<input name="location" value={form.location} onChange={updateForm} placeholder="Street, landmark, or neighborhood" required /></label>
          </div>
          <section className="photo-upload-section" aria-labelledby="photo-upload-title">
            <div className="photo-section-heading">
              <ImagePlus size={16} />
              <h3 id="photo-upload-title">Upload Photo <span>(Optional)</span></h3>
            </div>
            {!photo ? (
              <div
                className={`photo-dropzone ${isDraggingPhoto ? 'dragging' : ''}`}
                onDragOver={(event) => { event.preventDefault(); setIsDraggingPhoto(true) }}
                onDragLeave={() => setIsDraggingPhoto(false)}
                onDrop={handlePhotoDrop}
              >
                <span className="photo-drop-icon"><ImagePlus size={19} /></span>
                <p>Upload a photo of the civic issue to help the team understand the problem.</p>
                <label className="button button-outline photo-choose-button">
                  Choose Photo
                  <input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={handlePhotoInput} />
                </label>
                <small>JPG, JPEG, PNG, or WEBP · Max 5 MB · One photo</small>
              </div>
            ) : (
              <div className="photo-preview-card">
                <img src={photoPreview || undefined} alt={`Preview of ${photo.name}`} />
                <div className="photo-preview-info"><strong>{photo.name}</strong><small>{(photo.size / (1024 * 1024)).toFixed(2)} MB</small></div>
                <button type="button" className="photo-remove-button" onClick={() => { setPhoto(null); setPhotoError('') }}>Remove Photo</button>
              </div>
            )}
            {photoError && <p className="photo-validation-error" role="alert"><AlertCircle size={14} />{photoError}</p>}
            <p className="photo-upload-note">Photo preview only. Image uploads are not yet included with submitted reports.</p>
          </section>
          <label>Your name <span className="field-optional">OPTIONAL</span><input name="citizenName" value={form.citizenName} onChange={updateForm} placeholder="Community member" /></label>
          <div className="form-actions">
            <button type="button" className="button button-outline" disabled={aiLoading || form.description.trim().length < 8} onClick={improveReport}><Sparkles size={15} />{aiLoading ? 'Preparing suggestion...' : 'Improve with CivicPulse AI'}</button>
            <button type="submit" className="button button-primary" disabled={saving}>{saving ? 'Submitting...' : 'Submit report'}<ArrowRight size={15} /></button>
          </div>
        </form>
      </section>
    )

    if (view === 'Track Complaint') return <section className="portal-panel page-panel track-page"><div className="page-icon aqua"><LocateFixed size={21} /></div><h2>Track a complaint</h2><p>Enter the report ID you received when the issue was submitted.</p><form className="track-form" onSubmit={trackComplaint}><label htmlFor="track-id">Report ID</label><div><input id="track-id" value={trackId} onChange={(event) => setTrackId(event.target.value)} placeholder="For example, CP-A1B2C3" required /><button className="button button-primary" type="submit">Track report <ArrowRight size={15} /></button></div></form>{trackError && <p className="inline-error"><AlertCircle size={15} />{trackError}</p>}{trackedReport && <div className="tracked-result"><div className="tracked-heading"><div><small>REPORT {trackedReport.id}</small><h3>{trackedReport.title}</h3></div><StatusPill status={trackedReport.status} /></div><p className="tracked-location"><MapPin size={14} />{trackedReport.location} · {trackedReport.category}</p><div className="timeline-list">{(trackedReport.timeline || []).map((item, index) => <div className="timeline-item" key={`${item.at}-${index}`}><span className="timeline-dot" /><div><strong>{item.status}</strong><p>{item.note}</p><small>{formatDate(item.at)}</small></div></div>)}</div></div>}</section>

    if (view === 'AI Assistant') return <section className="portal-panel page-panel ai-page"><div className="page-icon violet"><Bot size={21} /></div><span className="section-kicker">CIVICPULSE AI</span><h2>Your civic companion</h2><p>Describe a local issue and get help turning it into a clear report. Review all suggestions before submitting.</p><div className="ai-chat-window">{!aiResult ? <div className="ai-empty"><span className="assistant-avatar large"><Sparkles size={21} /></span><strong>What would you like help with?</strong><small>Try a question or describe a civic issue.</small></div> : <div className="ai-suggestion"><div className="suggestion-head"><Sparkles size={15} /><strong>Suggested report</strong></div><label>Title<input readOnly value={aiResult.title || ''} /></label><label>Category<input readOnly value={aiResult.category || 'Other'} /></label><label>Description<textarea readOnly rows="3" value={aiResult.description || ''} /></label>{Array.isArray(aiResult.nextSteps) && <div className="next-steps"><strong>Helpful next steps</strong>{aiResult.nextSteps.map((step) => <span key={step}><Check size={13} />{step}</span>)}</div>}<button className="button button-primary" onClick={applySuggestion}>Use in a report <ArrowRight size={15} /></button></div>}</div><form className="chat-form" onSubmit={askAssistant}><textarea value={aiText} onChange={(event) => setAiText(event.target.value)} rows="2" placeholder="Describe a problem or ask a civic question..." required minLength="8" /><button className="send-button" disabled={aiLoading || aiText.trim().length < 8} aria-label="Send to CivicPulse AI">{aiLoading ? <Activity size={17} /> : <Send size={17} />}</button></form>{!aiReady && <small className="local-ai-note">Using built-in civic guidance. Add a Gemini API key to enable Gemini responses.</small>}</section>

    if (view === 'Civic Services') return <div className="service-page"><div className="page-intro"><span className="section-kicker">CITY SERVICES</span><h2>Find the right team</h2><p>Choose an issue area to start a report with the right category selected.</p></div><div className="service-grid">{SERVICES.map(({ title, category, description, icon: Icon, color }) => <article className="service-card" key={title}><span className={`service-icon ${color}`}><Icon size={20} /></span><h3>{title}</h3><p>{description}</p><button className="inline-link" onClick={() => { setForm((current) => ({ ...current, category })); navigate('Report an Issue') }}>Start a report <ArrowRight size={14} /></button></article>)}</div><div className="service-note"><ShieldCheck size={17} /><span>Reports are saved to the community desk and can be tracked from My Reports.</span></div></div>

    if (view === 'Nearby Help') return <section className="portal-panel page-panel nearby-page"><div className="page-icon green"><MapPin size={21} /></div><span className="section-kicker">LOCAL SUPPORT</span><h2>Nearby civic help</h2><p>Use your city to find local civic offices, public utilities, and community support on the map.</p><div className="nearby-location"><MapPin size={17} /><div><small>Search area</small><strong>{profile.city}</strong></div><button className="button button-outline" onClick={() => navigate('Profile & Settings')}>Change location</button></div><a className="button button-primary maps-link" href={`https://www.google.com/maps/search/${encodeURIComponent(`municipal civic help near ${profile.city}`)}`} target="_blank" rel="noreferrer">Open nearby help in Maps <ArrowRight size={15} /></a><div className="nearby-services"><h3>What you can find</h3><span><Building2 size={16} /> Municipal offices and service centers</span><span><Waves size={16} /> Public utilities and water services</span><span><Trash2 size={16} /> Waste and sanitation services</span></div><p className="small-note">Map results are provided by Google Maps. For emergencies, contact your local emergency service.</p></section>

    if (view === 'Analytics') return <div className="analytics-page"><section className="portal-panel page-panel"><div className="panel-heading"><div><h2>Community analytics</h2><p>Reports submitted to the CivicPulse community desk.</p></div><span className="analytics-total">{analytics.total} total</span></div><div className="analytics-summary"><div><small>Open reports</small><strong>{analytics.open}</strong></div><div><small>Resolved</small><strong>{analytics.resolved}</strong></div><div><small>Resolution rate</small><strong>{analytics.total ? Math.round((analytics.resolved / analytics.total) * 100) : 0}%</strong></div></div><h3 className="chart-title">Reports by category</h3>{Object.keys(analytics.byCategory || {}).length === 0 ? <div className="portal-empty"><Activity size={22} /><span>Category analytics will appear after reports are submitted.</span></div> : <div className="analytics-bars">{Object.entries(analytics.byCategory).sort((a, b) => b[1] - a[1]).map(([category, count]) => <div className="analytics-bar-row" key={category}><div><span>{category}</span><strong>{count}</strong></div><span className="bar-track"><span style={{ width: `${Math.max(4, count / maxCategory * 100)}%` }} /></span></div>)}</div>}</section><section className="portal-panel page-panel status-analytics"><h2>Report status</h2>{Object.keys(analytics.byStatus || {}).length === 0 ? <p>There are no status updates yet.</p> : Object.entries(analytics.byStatus).map(([status, count]) => <div className="status-summary-row" key={status}><StatusPill status={status} /><strong>{count}</strong></div>)}</section></div>

    if (view === 'Admin Dashboard') return <section className="portal-panel page-panel"><div className="panel-heading"><div><h2>Admin dashboard</h2><p>Review community reports and update their status.</p></div><span className="admin-demo"><ShieldCheck size={14} /> DEMO ADMIN</span></div><div className="admin-summary"><div><small>Total reports</small><strong>{analytics.total}</strong></div><div><small>Needs attention</small><strong>{analytics.open}</strong></div><div><small>Resolved</small><strong>{analytics.resolved}</strong></div></div>{renderReports(filteredReports, true)}<p className="small-note">Status changes are available in this demo workspace and are saved through the backend.</p></section>

    if (view === 'Notifications') return <section className="portal-panel page-panel"><div className="panel-heading"><div><h2>Notifications</h2><p>Updates about your community reports.</p></div>{unreadCount > 0 && <span className="unread-label">{unreadCount} unread</span>}</div>{notifications.length === 0 ? <div className="portal-empty"><Bell size={22} /><strong>You are all caught up</strong><span>Report updates will appear here.</span></div> : <div className="notifications-list">{notifications.map((item) => <article className={`notification-item ${item.read ? '' : 'unread'}`} key={item.id}><span className="notification-symbol"><Bell size={16} /></span><div><p>{item.message}</p><small>{formatDate(item.at)}</small></div>{!item.read && <button className="mark-read-button" onClick={() => markRead(item)}><Check size={14} /> Mark read</button>}</article>)}</div>}</section>

    if (view === 'Profile & Settings') return <section className="portal-panel page-panel profile-page"><div className="panel-heading"><div><h2>Profile & settings</h2><p>Manage how CivicPulse personalizes your community desk.</p></div></div><form className="issue-form" onSubmit={saveProfile}><div className="profile-preview"><span className="profile-avatar"><UserRound size={23} /></span><div><strong>{profile.name || 'Citizen'}</strong><small>Community member</small></div></div><label>Display name<input value={profile.name} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} placeholder="Your name" required /></label><label>City or neighborhood<input value={profile.city} onChange={(event) => setProfile((current) => ({ ...current, city: event.target.value }))} placeholder="City, region" required /></label><button className="button button-primary" type="submit">Save settings <Check size={15} /></button></form><div className="settings-note"><ShieldCheck size={16} /><span>Your profile settings are stored in this browser on this device.</span></div></section>

    return null
  }

  return (
    <div className="citizen-app">
      <aside className={`citizen-sidebar ${menuOpen ? 'menu-open' : ''}`}>
        <a className="citizen-brand" href="#overview" onClick={(event) => { event.preventDefault(); navigate('Overview') }}><span className="citizen-brand-mark"><Activity size={18} /></span><span><strong>CivicPulse <i>AI</i></strong><small>Better cities, together.</small></span></a>
        <span className="side-label">WORKSPACE</span>
        <nav className="citizen-nav" aria-label="Citizen workspace">{NAV_ITEMS.map(({ name, icon: Icon, badge }) => <button key={name} className={view === name ? 'citizen-nav-item active' : 'citizen-nav-item'} onClick={() => navigate(name)}><Icon size={15} /><span>{name}</span>{badge && <small>{badge}</small>}</button>)}</nav>
        <div className="sidebar-promo"><span><Sparkles size={15} /></span><strong>Make your city better</strong><p>Every report is a step towards a better neighborhood.</p><button onClick={() => navigate('Report an Issue')}><Plus size={14} /> Report an issue</button></div>
        <button className="sidebar-profile" onClick={() => navigate('Profile & Settings')}><span className="profile-initial">{(profile.name || 'C').slice(0, 1).toUpperCase()}</span><span><strong>{profile.name || 'Citizen'}</strong><small>Profile & settings</small></span><Settings size={14} /></button>
      </aside>

      <main className="citizen-main">
        <header className="citizen-topbar"><button className="citizen-menu-toggle" onClick={() => setMenuOpen((open) => !open)} aria-label="Toggle navigation">{menuOpen ? <X size={18} /> : <Menu size={18} />}</button><div className="citizen-breadcrumb"><small>Citizen workspace /</small><strong>{view}</strong></div><div className="citizen-top-actions"><button className="location-chip" onClick={() => navigate('Profile & Settings')}><MapPin size={13} />{profile.city}</button><button className="top-bell" onClick={() => navigate('Notifications')} aria-label={`${unreadCount} unread notifications`}><Bell size={17} />{unreadCount > 0 && <i />}</button><button className="top-initial" onClick={() => navigate('Profile & Settings')} aria-label="Open profile">{(profile.name || 'C').slice(0, 1).toUpperCase()}</button></div></header>
        <div className="citizen-content"><div className="citizen-page-title"><div><span>{view === 'Overview' ? 'Your community at a glance' : today}</span><h1>{view === 'Overview' ? 'Overview' : view}</h1></div><button className="refresh-portal" onClick={loadDashboard} disabled={loading}><Activity size={14} />{loading ? 'Updating' : 'Refresh'}</button></div>
          {error && <div className="portal-alert error" role="alert"><AlertCircle size={16} /><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss"><X size={15} /></button></div>}
          {notice && <div className="portal-alert success" role="status"><CheckCircle2 size={16} /><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss"><X size={15} /></button></div>}
          {renderContent()}
          {selectedReport && view !== 'Track Complaint' && renderReportDetails(selectedReport)}
          <footer className="citizen-footer"><span><Activity size={13} /> CivicPulse AI <i /> Community operations</span><span><CalendarDays size={13} /> {today}</span></footer>
        </div>
      </main>
    </div>
  )
}

export default CitizenPortal
