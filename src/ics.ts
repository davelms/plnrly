import ICAL from 'ical.js'
import type { CalendarEvent } from './model'
import type { CalendarPayload } from './native'

const day = 86_400_000
const key = (date: ICAL.Time) => `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
const format = (date: ICAL.Time) => date.isDate ? key(date) : date.toJSDate().toISOString()

export function parseCalendar(payload: CalendarPayload, now = new Date()): CalendarEvent[] {
  if (!payload.text) return []
  const calendar = new ICAL.Component(ICAL.parse(payload.text))
  const components = calendar.getAllSubcomponents('vevent')
  const masters = components.filter(component => !component.hasProperty('recurrence-id'))
  const from = now.getTime() - 2 * 365 * day
  const until = now.getTime() + 2 * 365 * day
  const results: CalendarEvent[] = []
  for (const component of masters) {
    const event = new ICAL.Event(component)
    const title = String(component.getFirstPropertyValue('summary') || 'Untitled event')
    const rawUrl = component.getFirstPropertyValue('url')
    const url = typeof rawUrl === 'string' && /^https:\/\//i.test(rawUrl) ? rawUrl : undefined
    const add = (start: ICAL.Time, end: ICAL.Time, occurrence: string, instance = event) => {
      const time = start.toJSDate().getTime()
      if (time < from || time > until || String(component.getFirstPropertyValue('status') || '').toUpperCase() === 'CANCELLED') return
      results.push({ id: `${payload.id}:${event.uid}:${occurrence}`, feedId: payload.id, source: payload.provider, calendarName: payload.name, color: payload.color, title: String(instance.component.getFirstPropertyValue('summary') || title), start: format(start), end: format(end), url, location: String(instance.component.getFirstPropertyValue('location') || ''), description: String(instance.component.getFirstPropertyValue('description') || '') })
    }
    if (event.isRecurring()) {
      const iterator = event.iterator()
      for (let count = 0; count < 20_000; count++) {
        const occurrence = iterator.next()
        if (!occurrence || occurrence.toJSDate().getTime() > until) break
        const details = event.getOccurrenceDetails(occurrence)
        if (String(details.item.component.getFirstPropertyValue('status') || '').toUpperCase() === 'CANCELLED') continue
        add(details.startDate, details.endDate, occurrence.toString(), details.item)
      }
    } else add(event.startDate, event.endDate, event.startDate.toString())
  }
  return results
}
