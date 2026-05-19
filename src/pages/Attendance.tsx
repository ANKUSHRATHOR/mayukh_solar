import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  Camera, MapPin, LogIn, LogOut as LogOutIcon, Navigation, RefreshCw,
  AlertCircle, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { format } from 'date-fns';
import { compressImage, estimateBlur } from '@/lib/capture';
import { Link } from 'react-router-dom';

type Kind = 'check_in' | 'field_visit' | 'check_out';

const statusColor: Record<string, string> = {
  present: 'bg-success text-success-foreground',
  late: 'bg-warning text-warning-foreground',
  half_day: 'bg-accent text-accent-foreground',
  absent: 'bg-destructive text-destructive-foreground',
};

const Attendance = () => {
  const { staff, role } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const captureLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: 'Location not supported', variant: 'destructive' });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy });
        setLocating(false);
      },
      (err) => {
        toast({ title: 'Location failed', description: err.message, variant: 'destructive' });
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!/^image\//.test(f.type)) {
      toast({ title: 'Pick an image', variant: 'destructive' }); return;
    }
    setBusy(true); setPhase('Compressing...'); setProgress(20);
    try {
      const compressed = await compressImage(f);
      setProgress(60); setPhase('Checking quality...');
      const blur = await estimateBlur(compressed);
      setImageFile(compressed);
      setImagePreview(URL.createObjectURL(compressed));
      setImgInfo({ kb: Math.round(compressed.size / 1024), blur: Math.round(blur) });
      if (blur < 25) {
        toast({ title: 'Image looks blurry', description: 'Retake for a clearer shot if possible.', variant: 'destructive' });
      }
    } finally {
      setBusy(false); setProgress(0); setPhase('');
    }
  };

  const startPunch = (kind: Kind) => {
    setActiveKind(kind);
    setImageFile(null); setImagePreview(null); setImgInfo(null);
    setReading(''); setCoords(null); setProgress(0); setPhase('');
    captureLocation();
  };

  const cancelPunch = () => {
    setActiveKind(null);
    setImageFile(null); setImagePreview(null); setImgInfo(null);
    setReading(''); setCoords(null); setProgress(0); setPhase('');
  };

  const submitPunch = async () => {
    if (!activeKind || !staff?.user_id) return;
    if (!coords) { toast({ title: 'Capture location first', variant: 'destructive' }); return; }
    if (requiresPhoto && !imageFile) { toast({ title: 'Bike meter photo is required', variant: 'destructive' }); return; }

    setBusy(true);
    try {
      let imagePath: string | null = null;
      if (imageFile) {
        setPhase('Uploading image...'); setProgress(10);
        const path = `${staff.user_id}/${today}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage.from('attendance-media')
          .upload(path, imageFile, { contentType: 'image/jpeg', upsert: false });
        if (upErr) throw upErr;
        imagePath = path; setProgress(70);
      }
      setPhase('Saving punch...'); setProgress(85);
      const { error } = await supabase.rpc('punch_attendance' as any, {
        _kind: activeKind,
        _lat: coords.lat,
        _lng: coords.lng,
        _accuracy: coords.acc,
        _image_path: imagePath,
        _reading: reading ? Number(reading) : null,
      });
      if (error) throw error;
      setProgress(100);
      toast({ title: 'Recorded', description: `${activeKind.replace('_', ' ')} saved` });
      cancelPunch();
      qc.invalidateQueries({ queryKey: ['attendance-today', staff.user_id] });
      qc.invalidateQueries({ queryKey: ['attendance-recent', staff.user_id] });
      qc.invalidateQueries({ queryKey: ['attendance-events-today', staff.user_id] });
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setBusy(false); setPhase(''); setProgress(0);
    }
  };

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Attendance</h1>
          <p className="text-sm text-muted-foreground mt-1">{format(new Date(), 'EEEE, dd MMM yyyy')}</p>
        </div>
        <Link to="/my-attendance" className="text-sm text-primary underline shrink-0">Monthly view</Link>
      </div>

      <Card className="border-border shadow-card">
        <CardHeader className="pb-3"><CardTitle className="text-base">Today</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Badge className={statusColor[todayAttendance?.status ?? 'absent']}>
              {(todayAttendance?.status ?? 'absent').replace('_', ' ').toUpperCase()}
            </Badge>
            {todayAttendance?.check_in_at && <span className="text-sm text-muted-foreground">In: {format(new Date(todayAttendance.check_in_at), 'HH:mm')}</span>}
            {todayAttendance?.check_out_at && <span className="text-sm text-muted-foreground">Out: {format(new Date(todayAttendance.check_out_at), 'HH:mm')}</span>}
            {!!todayAttendance?.worked_minutes && (
              <span className="text-sm text-muted-foreground">Worked: {Math.floor(todayAttendance.worked_minutes / 60)}h {todayAttendance.worked_minutes % 60}m</span>
            )}
          </div>

          {!activeKind ? (
            <div className="grid grid-cols-3 gap-2">
              <Button onClick={() => startPunch('check_in')} className="gradient-primary text-primary-foreground"><LogIn className="h-4 w-4 mr-1" /> Check In</Button>
              <Button onClick={() => startPunch('field_visit')} variant="outline"><Navigation className="h-4 w-4 mr-1" /> Field</Button>
              <Button onClick={() => startPunch('check_out')} variant="outline"><LogOutIcon className="h-4 w-4 mr-1" /> Check Out</Button>
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold capitalize">{activeKind.replace('_', ' ')}</p>
                <Button variant="ghost" size="sm" onClick={cancelPunch} disabled={busy}>Cancel</Button>
              </div>

              <div className="space-y-2">
                <Label>Live Location <span className="text-destructive">*</span></Label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={captureLocation} disabled={locating || busy}>
                    <MapPin className="h-4 w-4 mr-1" /> {locating ? 'Getting...' : (coords ? 'Refresh' : 'Get')}
                  </Button>
                  {coords ? (
                    <span className="text-xs text-muted-foreground">{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)} (±{Math.round(coords.acc)}m)</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not captured yet</span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>
                  Bike Meter Photo {requiresPhoto && <span className="text-destructive">*</span>}
                  {!requiresPhoto && <span className="text-muted-foreground"> (optional)</span>}
                </Label>
                <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFileChosen} />
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                    <Camera className="h-4 w-4 mr-1" /> {imagePreview ? 'Retake' : 'Open camera'}
                  </Button>
                  {imgInfo && (
                    <>
                      <span className="text-xs text-muted-foreground">{imgInfo.kb} KB</span>
                      {imgInfo.blur < 25 ? (
                        <span className="text-xs text-warning flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Looks blurry</span>
                      ) : (
                        <span className="text-xs text-success flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Sharp</span>
                      )}
                    </>
                  )}
                </div>
                {imagePreview && (
                  <img src={imagePreview} alt="Bike meter preview" className="mt-2 max-h-56 rounded-md border border-border object-contain" />
                )}
              </div>

              <div className="space-y-2">
                <Label>Odometer reading (km) <span className="text-muted-foreground">(optional)</span></Label>
                <Input type="number" inputMode="decimal" value={reading} onChange={(e) => setReading(e.target.value)} placeholder="e.g. 12450" />
              </div>

              {busy && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{phase}</p>
                  <Progress value={progress} className="h-2" />
                </div>
              )}

              <Button onClick={submitPunch} disabled={busy || !coords || (requiresPhoto && !imageFile)} className="w-full gradient-primary text-primary-foreground">
                {busy ? phase || 'Saving...' : 'Submit'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

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
    </div>
  );
};

export default Attendance;
