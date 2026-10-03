import { useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { CalendarEvent } from './model'
import type { CalendarSource } from './native'

type CalendarMode = 'Schedule' | 'Week' | 'Month'
const dateOnly = /^\d{4}-\d\d-\d\d$/
const key = (date: Date) => date.toLocaleDateString('en-CA')
const localDay = (value: string) => new Date(`${value}T12:00:00`)
const addDays = (date: Date, amount: number) => { const next = new Date(date); next.setDate(next.getDate() + amount); return next }
const startOfDay = (date: Date) => { const next = new Date(date); next.setHours(0, 0, 0, 0); return next }
const eventDate = (value: string) => dateOnly.test(value) ? startOfDay(localDay(value)) : new Date(value)
const formatDay = (date: Date, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(undefined, options).format(date)
const time = (value: string) => new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export function eventOnDay(event: CalendarEvent, day: Date) {
  const start = eventDate(event.start)
  const end = eventDate(event.end)
  const dayStart = startOfDay(day)
  const nextDay = addDays(dayStart, 1)
  return start < nextDay && (end > dayStart || end <= start && start >= dayStart)
}

function daysFor(mode: CalendarMode, anchor: Date) {
  const first = startOfDay(anchor)
  if (mode === 'Week') first.setDate(first.getDate() - first.getDay())
  if (mode === 'Month') { first.setDate(1); first.setDate(first.getDate() - first.getDay()) }
  const count = mode === 'Schedule' ? 14 : mode === 'Week' ? 7 : 42
  return Array.from({ length: count }, (_, index) => addDays(first, index))
}

function rangeTitle(mode: CalendarMode, anchor: Date, days: Date[]) {
  if (mode === 'Month') return formatDay(anchor, { month: 'long', year: 'numeric' })
  const first = formatDay(days[0], { month: 'short', day: 'numeric' })
  const last = formatDay(days.at(-1)!, { month: 'short', day: 'numeric', year: 'numeric' })
  return `${first} – ${last}`
}

export function AgendaRow({ event, onOpen }: { event: CalendarEvent; onOpen: (event: CalendarEvent) => void }) {
  const allDay = dateOnly.test(event.start)
  return <button className="agenda-row" type="button" onClick={() => onOpen(event)}><span className="agenda-time">{allDay ? 'All day' : time(event.start)}</span><span className="agenda-bar" style={{ backgroundColor: event.color || '#4975e9' }}/><span className="agenda-detail"><strong>{event.title}</strong><small>{allDay ? 'All day' : time(event.end)} · {event.calendarName || event.source}</small></span></button>
}

export function EventDetails({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const allDay = dateOnly.test(event.start)
  const start = eventDate(event.start)
  const end = eventDate(event.end)
  const when = allDay
    ? `${formatDay(start, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}${end > addDays(start, 1) ? ` – ${formatDay(addDays(end, -1), { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}` : ''} · All day`
    : `${formatDay(start, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · ${time(event.start)} – ${time(event.end)}`
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal event-modal" role="dialog" aria-modal="true" aria-labelledby="event-title" onMouseDown={event => event.stopPropagation()}><div className="modal-head"><h2 id="event-title">{event.title}</h2><button className="icon-button" aria-label="Close event" onClick={onClose}><X size={20}/></button></div><div className="event-details"><p><strong>When</strong><span>{when}</span></p><p><strong>Calendar</strong><span className="event-calendar-name"><i className="calendar-swatch" style={{ backgroundColor: event.color || '#4975e9' }}/>{event.calendarName || event.source}</span></p>{event.location && <p><strong>Location</strong><span>{event.location}</span></p>}{event.description && <p><strong>Description</strong><span className="event-description">{event.description}</span></p>}</div><div className="modal-actions"><span>Read only event</span>{event.url && <a className="secondary-button" href={event.url} target="_blank" rel="noreferrer">Open event link</a>}<button className="primary-button" onClick={onClose}>Done</button></div></section></div>
}

export default function CalendarView({ events, sources, onOpen, onRefresh, onSettings }: { events: CalendarEvent[]; sources: CalendarSource[]; onOpen: (event: CalendarEvent) => void; onRefresh: () => void; onSettings: () => void }) {
  const [mode, setMode] = useState<CalendarMode>('Schedule')
  const [anchorKey, setAnchorKey] = useState(() => key(new Date()))
  const anchor = localDay(anchorKey)
  const days = daysFor(mode, anchor)
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start))
  const entries = days.map(day => ({ day, events: sorted.filter(event => eventOnDay(event, day)) }))
  function navigate(direction: number) {
    const next = new Date(anchor)
    if (mode === 'Month') { next.setDate(1); next.setMonth(next.getMonth() + direction) }
    else next.setDate(next.getDate() + direction * (mode === 'Week' ? 7 : 14))
    setAnchorKey(key(next))
  }
  return <section className="panel calendar-page"><div className="section-top"><div><h2>Calendar</h2><p>Subscribed calendars are read only. Select an event for details.</p></div><div className="calendar-controls"><button className="secondary-button" onClick={onRefresh}>Refresh</button></div></div><div className="calendar-toolbar"><div className="calendar-modes" role="group" aria-label="Calendar view">{(['Schedule', 'Week', 'Month'] as CalendarMode[]).map(option => <button key={option} className={mode === option ? 'active' : ''} aria-pressed={mode === option} onClick={() => setMode(option)}>{option}</button>)}</div><div className="calendar-navigation"><button className="icon-button" aria-label={`Previous ${mode.toLowerCase()}`} onClick={() => navigate(-1)}><ChevronLeft size={18}/></button><button className="secondary-button" onClick={() => setAnchorKey(key(new Date()))}>Today</button><button className="icon-button" aria-label={`Next ${mode.toLowerCase()}`} onClick={() => navigate(1)}><ChevronRight size={18}/></button></div></div>{sources.length > 0 && <div className="calendar-legend" aria-label="Calendar colors">{sources.map(source => <span key={source.id}><i className="calendar-swatch" style={{ backgroundColor: source.color }}/>{source.name}</span>)}</div>}<h3 className="calendar-range">{rangeTitle(mode, anchor, days)}</h3>{!sources.length ? <div className="calendar-empty"><strong>No calendars added</strong><span>Add an ICS calendar to see events here.</span><button className="secondary-button" onClick={onSettings}>Add calendar in Settings</button></div> : mode === 'Schedule' ? <div className="schedule-list">{entries.filter(entry => entry.events.length).length ? entries.filter(entry => entry.events.length).map(entry => <div className="schedule-day" key={key(entry.day)}><h4>{formatDay(entry.day, { weekday: 'long', month: 'long', day: 'numeric' })}</h4>{entry.events.map(event => <AgendaRow key={event.id} event={event} onOpen={onOpen}/>)}</div>) : <div className="calendar-empty"><strong>No events in this range</strong><span>Use the arrows to browse other dates.</span></div>}</div> : <div className={`calendar-grid ${mode.toLowerCase()}`}><div className="calendar-weekdays">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <span key={day}>{day}</span>)}</div><div className="calendar-days">{entries.map(entry => <div key={key(entry.day)} className={`calendar-cell ${mode === 'Month' && entry.day.getMonth() !== anchor.getMonth() ? 'outside' : ''} ${key(entry.day) === key(new Date()) ? 'is-today' : ''}`}><span className="calendar-date">{mode === 'Week' ? formatDay(entry.day, { month: 'short', day: 'numeric' }) : entry.day.getDate()}</span><div className="calendar-cell-events">{entry.events.slice(0, mode === 'Month' ? 3 : undefined).map(event => <button key={event.id} className="calendar-event" style={{ borderLeftColor: event.color || '#4975e9', backgroundColor: event.color ? `${event.color}18` : undefined }} onClick={() => onOpen(event)} title={event.title}>{!dateOnly.test(event.start) && `${time(event.start)} `}{event.title}</button>)}{mode === 'Month' && entry.events.length > 3 && <span className="calendar-more">+{entry.events.length - 3} more</span>}</div></div>)}</div></div>}</section>
}
