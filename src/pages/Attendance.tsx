import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Camera, MapPin, LogIn, LogOut as LogOutIcon, Navigation, RefreshCw,
  AlertCircle, CheckCircle2, AlertTriangle, Loader2, Send,
} from 'lucide-react';
import { format } from 'date-fns';
import { compressImage, estimateBlur } from '@/lib/capture';
import { acquireRefreshLock } from '@/lib/refreshLock';
import { Link } from 'react-router-dom';

type Kind = 'check_in' | 'field_visit' | 'check_out';

const statusColor: Record<string, string> = {
  present: 'bg-success text-success-foreground',
  late: 'bg-warning text-warning-foreground',
  half_day: 'bg-accent text-accent-foreground',
  absent: 'bg-destructive text-destructive-foreground',
};

const kindMeta: Record<Kind, { label: string; icon: any }> = {
  check_in: { label: 'Check In', icon: LogIn },
  field_visit: { label: 'Field Visit', icon: Navigation },
  check_out: { label: 'Check Out', icon: LogOutIcon },
};

type PunchDraft = {
  kind: Kind;
  coords: { lat: number; lng: number; acc: number } | null;
  reading: string;
};

type LocalPunchMap = Partial<Record<Kind, string>>;

const getDraftKey = (userId: string, date: string) => `attendance-draft:${userId}:${date}`;
const getLocalPunchKey = (userId: string, date: string) => `attendance-local-punches:${userId}:${date}`;

const readStoredJson = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
};

const writeStoredJson = (key: string, value: unknown) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const Attendance = () => {
  const { staff, role } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const releaseRefreshLockRef = useRef<(() => void) | null>(null);
  const restoredDraftNoticeRef = useRef(false);

  const [activeKind, setActiveKind] = useState<Kind | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imgInfo, setImgInfo] = useState<{ kb: number; blur: number } | null>(null);
  const [reading, setReading] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<string>('');
  const [lastSuccess, setLastSuccess] = useState<{ kind: Kind; at: string } | null>(null);
  const [localPunches, setLocalPunches] = useState<LocalPunchMap>({});

  // Outside punch-out request
  const [reqOpen, setReqOpen] = useState(false);
  const [reqReason, setReqReason] = useState('');
  const [reqBusy, setReqBusy] = useState(false);

  const isSales = role === 'sales_person';
  const requiresPhoto = isSales;
  const requiresLocation = isSales;
  const today = format(new Date(), 'yyyy-MM-dd');

  const { data: todayAttendance } = useQuery({
    queryKey: ['attendance-today', staff?.user_id],
    enabled: !!staff?.user_id,
    queryFn: async () => {
      const { data } = await supabase.from('attendance' as any)
        .select('*').eq('staff_user_id', staff!.user_id).eq('date', today).maybeSingle();
      return data as any;
    },
  });

  const { data: recent } = useQuery({
    queryKey: ['attendance-recent', staff?.user_id],
    enabled: !!staff?.user_id,
    queryFn: async () => {
      const { data } = await supabase.from('attendance' as any)
        .select('*').eq('staff_user_id', staff!.user_id)
        .order('date', { ascending: false }).limit(30);
      return (data as any[]) || [];
    },
  });

  const { data: todayEvents } = useQuery({
    queryKey: ['attendance-events-today', staff?.user_id],
    enabled: !!staff?.user_id,
    queryFn: async () => {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const { data } = await supabase.from('attendance_events' as any)
        .select('*').eq('staff_user_id', staff!.user_id)
        .gte('captured_at', start.toISOString()).order('captured_at', { ascending: false });
      return (data as any[]) || [];
    },
  });

  const { data: myRequests } = useQuery({
    queryKey: ['my-punchout-reqs', staff?.user_id],
    enabled: !!staff?.user_id && isSales,
    queryFn: async () => {
      const { data } = await supabase.from('punch_out_requests' as any)
        .select('*').eq('staff_user_id', staff!.user_id)
        .order('created_at', { ascending: false }).limit(5);
      return (data as any[]) || [];
    },
  });

  useEffect(() => {
    if (!staff?.user_id) {
      setLocalPunches({});
      return;
    }

    const savedPunches = readStoredJson<LocalPunchMap>(getLocalPunchKey(staff.user_id, today)) || {};
    setLocalPunches(savedPunches);

    const savedDraft = readStoredJson<PunchDraft>(getDraftKey(staff.user_id, today));
    if (!savedDraft?.kind) return;

    releaseRefreshLockRef.current?.();
    releaseRefreshLockRef.current = acquireRefreshLock(`attendance-punch-${savedDraft.kind}`);
    setActiveKind(savedDraft.kind);
    setCoords(savedDraft.coords ?? null);
    setReading(savedDraft.reading ?? '');

    if (!restoredDraftNoticeRef.current) {
      restoredDraftNoticeRef.current = true;
      toast({
        title: 'Punch restored',
        description: 'Your in-progress punch was reopened. Please capture the bike photo again and submit.',
      });
    }
  }, [staff?.user_id, today, toast]);

  useEffect(() => {
    if (!staff?.user_id) return;

    const draftKey = getDraftKey(staff.user_id, today);
    if (!activeKind) {
      localStorage.removeItem(draftKey);
      return;
    }

    writeStoredJson(draftKey, {
      kind: activeKind,
      coords,
      reading,
    } satisfies PunchDraft);
  }, [activeKind, coords, reading, staff?.user_id, today]);

  const successfulTodayEvents = (todayEvents || []).filter((event: any) => !event.is_rejected);
  const checkInEvent = [...successfulTodayEvents]
    .filter((event: any) => event.kind === 'check_in')
    .sort((a: any, b: any) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime())[0];
  const checkOutEvent = [...successfulTodayEvents]
    .filter((event: any) => event.kind === 'check_out')
    .sort((a: any, b: any) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime())[0];
  const fieldVisitEvent = successfulTodayEvents.find((event: any) => event.kind === 'field_visit');

  const displayCheckInAt = todayAttendance?.check_in_at ?? checkInEvent?.captured_at ?? localPunches.check_in ?? null;
  const displayCheckOutAt = todayAttendance?.check_out_at ?? checkOutEvent?.captured_at ?? localPunches.check_out ?? null;
  const hasFieldVisit = Boolean(fieldVisitEvent || localPunches.field_visit);
  const hasCheckIn = Boolean(displayCheckInAt);
  const hasCheckOut = Boolean(displayCheckOutAt);
  const displayStatus = todayAttendance?.status ?? (hasCheckIn ? 'present' : 'absent');

  const visibleKinds = useMemo<Kind[]>(() => (
    isSales ? ['check_in', 'field_visit', 'check_out'] : ['check_in', 'check_out']
  ), [isSales]);

  const kindAvailability = useMemo<Record<Kind, { disabled: boolean; helper: string }>>(() => ({
    check_in: {
      disabled: hasCheckIn,
      helper: hasCheckIn ? 'Already recorded for today' : 'Start your attendance',
    },
    field_visit: {
      disabled: !hasCheckIn || hasCheckOut || hasFieldVisit,
      helper: !hasCheckIn
        ? 'Available after check in'
        : hasCheckOut
          ? 'Closed after check out'
          : hasFieldVisit
            ? 'Already recorded today'
            : 'Record your field movement',
    },
    check_out: {
      disabled: !hasCheckIn || hasCheckOut,
      helper: !hasCheckIn
        ? 'Available after check in'
        : hasCheckOut
          ? 'Already recorded for today'
          : 'Finish today\'s attendance',
    },
  }), [hasCheckIn, hasCheckOut, hasFieldVisit]);

  const captureLocation = () => {
    if (!navigator.geolocation) { toast({ title: 'Location not supported', variant: 'destructive' }); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }); setLocating(false); },
      (err) => { toast({ title: 'Location failed', description: err.message, variant: 'destructive' }); setLocating(false); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    if (!/^image\//.test(f.type)) { toast({ title: 'Pick an image', variant: 'destructive' }); return; }
    setBusy(true); setPhase('Compressing...'); setProgress(20);
    try {
      const compressed = await compressImage(f);
      setProgress(60); setPhase('Checking quality...');
      const blur = await estimateBlur(compressed);
      setImageFile(compressed);
      setImagePreview(URL.createObjectURL(compressed));
      setImgInfo({ kb: Math.round(compressed.size / 1024), blur: Math.round(blur) });
      if (blur < 25) toast({ title: 'Image looks blurry', description: 'Retake for a clearer shot if possible.', variant: 'destructive' });
    } finally { setBusy(false); setProgress(0); setPhase(''); }
  };

  const startPunch = (kind: Kind) => {
    releaseRefreshLockRef.current?.();
    releaseRefreshLockRef.current = acquireRefreshLock(`attendance-punch-${kind}`);
    setActiveKind(kind);
    setImageFile(null); setImagePreview(null); setImgInfo(null);
    setReading(''); setCoords(null); setProgress(0); setPhase('');
    if (requiresLocation) captureLocation();
  };

  const cancelPunch = () => {
    releaseRefreshLockRef.current?.();
    releaseRefreshLockRef.current = null;
    setActiveKind(null);
    setImageFile(null); setImagePreview(null); setImgInfo(null);
    setReading(''); setCoords(null); setProgress(0); setPhase('');
  };

  useEffect(() => {
    return () => {
      releaseRefreshLockRef.current?.();
      releaseRefreshLockRef.current = null;
    };
  }, []);

  const submitPunch = async () => {
    if (busy || !activeKind || !staff?.user_id) return;
    if (requiresLocation && !coords) { toast({ title: 'Capture location first', variant: 'destructive' }); return; }
    if (requiresPhoto && !imageFile) { toast({ title: 'Bike meter photo is required', variant: 'destructive' }); return; }

    setBusy(true);
    try {
      await Promise.all([
        qc.cancelQueries({ queryKey: ['attendance-today', staff.user_id] }),
        qc.cancelQueries({ queryKey: ['attendance-recent', staff.user_id] }),
        qc.cancelQueries({ queryKey: ['attendance-events-today', staff.user_id] }),
      ]);

      const savedKind = activeKind;
      const capturedAt = new Date().toISOString();
      let imagePath: string | null = null;
      if (imageFile) {
        setPhase('Uploading image...'); setProgress(10);
        const path = `${staff.user_id}/${today}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage.from('attendance-media')
          .upload(path, imageFile, { contentType: 'image/jpeg', upsert: false, cacheControl: '3600' });
        if (upErr) throw upErr;
        imagePath = path; setProgress(70);
      }
      setPhase('Saving punch...'); setProgress(85);
      const { error } = await supabase.rpc('punch_attendance' as any, {
        _kind: savedKind, _lat: coords?.lat ?? null, _lng: coords?.lng ?? null,
        _accuracy: coords?.acc ?? null, _image_path: imagePath,
        _reading: reading ? Number(reading) : null,
      });
      if (error) throw error;

      qc.setQueryData(['attendance-events-today', staff.user_id], (current: any[] | undefined) => {
        const existing = (current || []).filter((event: any) => !(event.kind === savedKind && !event.is_rejected));
        return [{
          id: `optimistic-${savedKind}-${capturedAt}`,
          staff_user_id: staff.user_id,
          kind: savedKind,
          captured_at: capturedAt,
          latitude: coords?.lat ?? null,
          longitude: coords?.lng ?? null,
          accuracy_m: coords?.acc ?? null,
          bike_meter_image_path: imagePath,
          bike_meter_reading: reading ? Number(reading) : null,
          is_rejected: false,
        }, ...existing];
      });

      qc.setQueryData(['attendance-today', staff.user_id], (current: any) => ({
        ...(current || { staff_user_id: staff.user_id, date: today, worked_minutes: 0 }),
        check_in_at: savedKind === 'check_in' ? capturedAt : current?.check_in_at ?? null,
        check_out_at: savedKind === 'check_out' ? capturedAt : current?.check_out_at ?? null,
        status: current?.status ?? 'present',
      }));

      setLastSuccess({ kind: savedKind, at: capturedAt });
      setProgress(100);
      toast({ title: 'Recorded', description: `${savedKind.replace('_', ' ')} saved at ${format(new Date(capturedAt), 'HH:mm')}` });
      cancelPunch();
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['attendance-today', staff.user_id] }),
        qc.invalidateQueries({ queryKey: ['attendance-recent', staff.user_id] }),
        qc.invalidateQueries({ queryKey: ['attendance-events-today', staff.user_id] }),
      ]);
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message || 'Unknown error', variant: 'destructive' });
    } finally { setBusy(false); setPhase(''); setProgress(0); }
  };

  const sendOutsideRequest = async () => {
    if (!reqReason.trim()) { toast({ title: 'Reason required', variant: 'destructive' }); return; }
    if (!coords) { toast({ title: 'Capture location first', variant: 'destructive' }); return; }
    setReqBusy(true);
    try {
      const { error } = await supabase.rpc('request_special_punch_out' as any, {
        _lat: coords.lat, _lng: coords.lng, _reason: reqReason.trim(),
      });
      if (error) throw error;
      toast({ title: 'Request sent', description: 'Admin has been notified.' });
      setReqOpen(false); setReqReason('');
      qc.invalidateQueries({ queryKey: ['my-punchout-reqs', staff?.user_id] });
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    } finally { setReqBusy(false); }
  };

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6 animate-in-up">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-display text-2xl sm:text-3xl">My Attendance</h1>
          <p className="text-sm text-muted-foreground mt-1">{format(new Date(), 'EEEE, dd MMM yyyy')}</p>
        </div>
        <Link to="/my-attendance" className="text-sm text-primary underline shrink-0">Monthly view</Link>
      </div>

      {/* Status hero */}
      <div className="bento p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Badge className={`${statusColor[displayStatus] ?? statusColor.absent} text-sm px-3 py-1`}>
              {displayStatus.replace('_', ' ').toUpperCase()}
            </Badge>
            {!!todayAttendance?.worked_minutes && (
              <span className="text-sm text-muted-foreground">
                Worked {Math.floor(todayAttendance.worked_minutes / 60)}h {todayAttendance.worked_minutes % 60}m
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="text-center">
              <p className="text-muted-foreground">In</p>
              <p className="font-semibold text-foreground text-sm">
                {displayCheckInAt ? format(new Date(displayCheckInAt), 'HH:mm') : '—'}
              </p>
            </div>
            <div className="h-8 w-px bg-border" />
            <div className="text-center">
              <p className="text-muted-foreground">Out</p>
              <p className="font-semibold text-foreground text-sm">
                {displayCheckOutAt ? format(new Date(displayCheckOutAt), 'HH:mm') : '—'}
              </p>
            </div>
          </div>
        </div>

        {lastSuccess && (
          <div className="mt-4 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-foreground">
            {kindMeta[lastSuccess.kind].label} recorded at {format(new Date(lastSuccess.at), 'HH:mm')}.
          </div>
        )}

        {!activeKind ? (
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {availableKinds.length ? availableKinds.map((k) => {
              const Meta = kindMeta[k];
              const Icon = Meta.icon;
              const primary = k === 'check_in';
              return (
                <button
                  key={k}
                  onClick={() => startPunch(k)}
                  className={`group relative h-20 sm:h-24 rounded-xl border transition-all active:scale-[0.98] flex flex-col items-center justify-center gap-1.5 px-3 ${
                    primary
                      ? 'gradient-primary text-primary-foreground border-transparent shadow-elevated hover:shadow-glow'
                      : 'border-border bg-card/60 hover:bg-card hover:border-primary/40 backdrop-blur'
                  }`}
                >
                  <Icon className="h-6 w-6 shrink-0" />
                  <span className="text-sm font-semibold leading-tight text-center">{Meta.label}</span>
                </button>
              );
            }) : (
              <div className="sm:col-span-3 rounded-xl border border-border bg-card/50 p-4 text-sm text-muted-foreground">
                Today&apos;s attendance is already completed.
              </div>
            )}
          </div>
        ) : (
          <div className="mt-5 space-y-4 rounded-xl border border-border bg-background/40 backdrop-blur p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <p className="font-semibold capitalize text-base">{activeKind.replace('_', ' ')}</p>
              <Button variant="ghost" size="sm" onClick={cancelPunch} disabled={busy}>Cancel</Button>
            </div>

            {requiresLocation && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Live Location <span className="text-destructive">*</span>
                </Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={captureLocation} disabled={locating || busy} className="h-9">
                    <MapPin className="h-4 w-4 mr-1.5" /> {locating ? 'Getting...' : (coords ? 'Refresh' : 'Capture')}
                  </Button>
                  {coords ? (
                    <span className="text-xs text-muted-foreground break-all">
                      {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)} (±{Math.round(coords.acc)}m)
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not captured yet</span>
                  )}
                </div>
              </div>
            )}

            {requiresPhoto && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Bike Meter Photo <span className="text-destructive">*</span>
                </Label>
                <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFileChosen} />
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={busy} className="h-9">
                    <Camera className="h-4 w-4 mr-1.5" /> {imagePreview ? 'Retake' : 'Open camera'}
                  </Button>
                  {imgInfo && (
                    <>
                      <span className="text-xs text-muted-foreground">{imgInfo.kb} KB</span>
                      {imgInfo.blur < 25 ? (
                        <span className="text-xs text-warning flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Blurry</span>
                      ) : (
                        <span className="text-xs text-success flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Sharp</span>
                      )}
                    </>
                  )}
                </div>
                {imagePreview && <img src={imagePreview} alt="Preview" className="mt-2 max-h-56 rounded-lg border border-border object-contain w-full" />}
              </div>
            )}

            {requiresPhoto && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Odometer (km) <span className="text-muted-foreground/70 normal-case font-normal">optional</span>
                </Label>
                <Input type="number" inputMode="decimal" value={reading} onChange={(e) => setReading(e.target.value)} placeholder="e.g. 12450" className="h-10" />
              </div>
            )}

            {busy && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{phase}</p>
                <Progress value={progress} className="h-2" />
              </div>
            )}

            <Button
              onClick={submitPunch}
              disabled={busy || (requiresLocation && !coords) || (requiresPhoto && !imageFile)}
              className="w-full h-12 btn-glow text-base font-semibold"
            >
              {busy ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />{phase || 'Saving…'}</> : 'Submit Punch'}
            </Button>

            {isSales && activeKind === 'check_out' && (
              <div className="pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">Going home from the field? Send a request to admin to punch out from current location.</p>
                <Button variant="outline" size="sm" className="w-full h-10" onClick={() => setReqOpen(true)}>
                  <Send className="h-4 w-4 mr-1.5" /> Request outside punch-out
                </Button>
              </div>
            )}
          </div>
        )}
      </div>


      {isSales && !!myRequests?.length && (
        <Card className="border-border shadow-card">
          <CardHeader className="pb-3"><CardTitle className="text-base">My recent outside punch-out requests</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {myRequests.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium capitalize">{r.status}</p>
                  <p className="text-xs text-muted-foreground truncate">{r.reason}</p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{format(new Date(r.created_at), 'dd MMM HH:mm')}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!!todayEvents?.length && (
        <Card className="border-border shadow-card">
          <CardHeader className="pb-3"><CardTitle className="text-base">Today's punches</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {todayEvents.map((e: any) => (
                <div key={e.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    {e.is_rejected ? <AlertCircle className="h-4 w-4 text-destructive shrink-0" /> : <CheckCircle2 className="h-4 w-4 text-success shrink-0" />}
                    <span className="font-medium capitalize">{e.kind.replace('_', ' ')}</span>
                    <span className="text-muted-foreground">{format(new Date(e.captured_at), 'HH:mm')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {e.latitude && (
                      <a className="text-xs text-primary underline" href={`https://www.google.com/maps?q=${e.latitude},${e.longitude}`} target="_blank" rel="noreferrer">Map</a>
                    )}
                    {e.is_rejected && (
                      <Button size="sm" variant="outline" onClick={() => startPunch(e.kind)}>
                        <RefreshCw className="h-3 w-3 mr-1" /> Reupload
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border shadow-card">
        <CardHeader className="pb-3"><CardTitle className="text-base">Last 30 days</CardTitle></CardHeader>
        <CardContent>
          {!recent?.length ? <p className="text-sm text-muted-foreground">No records yet.</p> : (
            <div className="space-y-2">
              {recent.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-2 text-sm">
                  <span className="font-medium">{format(new Date(r.date), 'dd MMM, EEE')}</span>
                  <div className="flex items-center gap-3">
                    <Badge className={statusColor[r.status]}>{r.status.replace('_', ' ')}</Badge>
                    <span className="text-xs text-muted-foreground">{Math.floor((r.worked_minutes || 0) / 60)}h {(r.worked_minutes || 0) % 60}m</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={reqOpen} onOpenChange={setReqOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Outside Punch-Out Request</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">Your current location and the reason below will be sent to admin for approval. Once approved, you can check out from here.</p>
            <div className="space-y-1.5"><Label>Reason</Label>
              <Textarea rows={3} value={reqReason} onChange={(e) => setReqReason(e.target.value)} placeholder="Going home directly after late site visit…" />
            </div>
            {coords && <p className="text-xs text-muted-foreground">📍 {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReqOpen(false)} disabled={reqBusy}>Cancel</Button>
            <Button onClick={sendOutsideRequest} disabled={reqBusy} className="gradient-primary text-primary-foreground">
              {reqBusy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />} Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Attendance;
