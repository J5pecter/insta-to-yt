import React, { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Film,
  CheckCircle2,
  AlertTriangle,
  X,
  Play
} from 'lucide-react';
import { api } from '../services/api';

interface CalendarPageProps {
  onNavigate: (tab: string, meta?: any) => void;
}

export const CalendarPage: React.FC<CalendarPageProps> = ({ onNavigate }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'month' | 'week' | 'day'>('month');
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);

  const loadCalendarEvents = async () => {
    setLoading(true);
    try {
      const res = await api.getCalendar();
      setEvents(res.events || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCalendarEvents();
  }, []);

  const handlePrev = () => {
    const next = new Date(currentDate);
    if (view === 'month') next.setMonth(next.getMonth() - 1);
    else if (view === 'week') next.setDate(next.getDate() - 7);
    else next.setDate(next.getDate() - 1);
    setCurrentDate(next);
  };

  const handleNext = () => {
    const next = new Date(currentDate);
    if (view === 'month') next.setMonth(next.getMonth() + 1);
    else if (view === 'week') next.setDate(next.getDate() + 7);
    else next.setDate(next.getDate() + 1);
    setCurrentDate(next);
  };

  // Generate days in month grid
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const days = [];
  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(new Date(year, month, d));
  }

  const getEventsForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return events.filter((e) => e.scheduled_at && e.scheduled_at.startsWith(dateStr));
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Calendar Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">Content Calendar</h1>
          <p className="text-sm text-muted">
            Visualize your scheduled distribution slots across YouTube Shorts and Instagram Reels.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1 bg-surface p-1 rounded-xl border border-border text-xs font-semibold">
            <button
              onClick={() => setView('month')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                view === 'month' ? 'bg-primary text-white' : 'text-muted hover:text-foreground'
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setView('week')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                view === 'week' ? 'bg-primary text-white' : 'text-muted hover:text-foreground'
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setView('day')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                view === 'day' ? 'bg-primary text-white' : 'text-muted hover:text-foreground'
              }`}
            >
              Day
            </button>
          </div>

          <div className="flex items-center space-x-1 bg-surface p-1 rounded-xl border border-border">
            <button onClick={handlePrev} className="p-1.5 text-muted hover:text-foreground">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-semibold px-2 text-foreground">
              {currentDate.toLocaleDateString([], { month: 'short', year: 'numeric' })}
            </span>
            <button onClick={handleNext} className="p-1.5 text-muted hover:text-foreground">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Month View Grid */}
      <div className="p-6 rounded-2xl bg-surface border border-border space-y-4">
        {/* Days of week header */}
        <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-muted uppercase tracking-wider">
          <span>Sun</span>
          <span>Mon</span>
          <span>Tue</span>
          <span>Wed</span>
          <span>Thu</span>
          <span>Fri</span>
          <span>Sat</span>
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-2">
          {days.map((d, index) => {
            if (!d) {
              return <div key={`empty-${index}`} className="h-28 rounded-xl bg-background/20" />;
            }
            const dayEvents = getEventsForDate(d);
            const isToday = new Date().toDateString() === d.toDateString();

            return (
              <div
                key={d.toISOString()}
                className={`h-28 p-2 rounded-xl border flex flex-col justify-between transition-colors overflow-hidden ${
                  isToday
                    ? 'border-primary bg-primary/5'
                    : 'border-border/60 bg-elevated/40 hover:border-border'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold ${isToday ? 'text-primary' : 'text-foreground'}`}>
                    {d.getDate()}
                  </span>
                  {dayEvents.length > 0 && (
                    <span className="text-[10px] font-mono text-primary font-bold">{dayEvents.length}</span>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto space-y-1 my-1">
                  {dayEvents.map((evt) => (
                    <div
                      key={evt.id}
                      onClick={() => setSelectedEvent(evt)}
                      className="p-1 rounded bg-surface border border-border text-[10px] text-foreground truncate cursor-pointer hover:border-primary transition-colors flex items-center space-x-1"
                      title={evt.title}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        evt.status === 'PUBLISHED' ? 'bg-success' : 'bg-primary'
                      }`} />
                      <span className="truncate">{evt.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Event Details Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl max-w-sm w-full border border-border p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <span className="text-sm font-bold text-foreground">Scheduled Publication</span>
              <button onClick={() => setSelectedEvent(null)} className="text-muted hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {selectedEvent.thumbnail_url && (
                <img
                  src={selectedEvent.thumbnail_url}
                  alt=""
                  className="w-full h-36 object-cover rounded-xl bg-black border border-border"
                />
              )}
              <div>
                <span className="text-xs font-semibold text-foreground block">{selectedEvent.title}</span>
                <span className="text-[11px] text-muted flex items-center space-x-1 mt-1">
                  <Clock className="w-3 h-3 text-primary" />
                  <span>{new Date(selectedEvent.scheduled_at).toLocaleString()}</span>
                </span>
              </div>

              <div className="flex items-center space-x-2">
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                  selectedEvent.status === 'PUBLISHED' ? 'bg-success/20 text-success' : 'bg-primary/20 text-primary'
                }`}>
                  {selectedEvent.status}
                </span>
                {selectedEvent.platforms?.map((p: string) => (
                  <span key={p} className="px-2 py-0.5 rounded text-[10px] font-semibold bg-elevated text-muted capitalize">
                    {p}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-border">
              {selectedEvent.status !== 'PUBLISHED' && (
                <button
                  type="button"
                  onClick={async () => {
                    await api.cancelPublishing(selectedEvent.id);
                    setSelectedEvent(null);
                    loadCalendarEvents();
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs text-destructive hover:bg-destructive/10 font-medium"
                >
                  Cancel Schedule
                </button>
              )}
              {selectedEvent.draft_id && (
                <button
                  type="button"
                  onClick={() => {
                    onNavigate('studio', { draftId: selectedEvent.draft_id });
                    setSelectedEvent(null);
                  }}
                  className="px-4 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold"
                >
                  Open Draft
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
