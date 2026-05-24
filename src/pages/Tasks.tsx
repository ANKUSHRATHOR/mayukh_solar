// Tasks: combined view — assignees (sales) see their tasks, admin/operator can create/manage.
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { compressImage } from '@/lib/capture';
import { Plus, Camera, CheckCircle2, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

const priorityColor: Record<string, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-info text-info-foreground',
  high: 'bg-warning text-warning-foreground',
  urgent: 'bg-destructive text-destructive-foreground',
};

const Tasks = () => {
  const { staff, role } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAdminOrOp = role === 'admin' || role === 'operator';

  const [createOpen, setCreateOpen] = useState(false);
  const [t, setT] = useState<any>({ title: '', description: '', priority: 'medium', due_date: '', assigned_to_user_id: '' });

  const [proofOpen, setProofOpen] = useState<any | null>(null);
  const [proofNotes, setProofNotes] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: salesPersons } = useQuery({
    queryKey: ['assignable-sales'],
    enabled: isAdminOrOp,
    queryFn: async () => {
      const { data } = await supabase.rpc('get_assignable_sales_persons');
      return (data as any[]) || [];
    },
  });

  const { data: tasks } = useQuery({
    queryKey: ['tasks', role, staff?.user_id],
    enabled: !!staff?.user_id,
    queryFn: async () => {
      let q = supabase
        .from('tasks' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (!isAdminOrOp) q = q.eq('assigned_to_user_id', staff!.user_id);
      const { data } = await q;
      return (data as any[]) || [];
    },
  });

  const createTask = async () => {
    if (!t.title.trim() || !t.assigned_to_user_id || !staff?.user_id) {
      toast({ title: 'Title and assignee required', variant: 'destructive' }); return;
    }
    const payload: any = {
      title: t.title.trim(),
      description: t.description || null,
      priority: t.priority,
      due_date: t.due_date || null,
      assigned_to_user_id: t.assigned_to_user_id,
      assigned_by_user_id: staff.user_id,
    };
    const { error } = await supabase.from('tasks' as any).insert(payload);
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Task assigned' });
    setCreateOpen(false);
    setT({ title: '', description: '', priority: 'medium', due_date: '', assigned_to_user_id: '' });
    qc.invalidateQueries({ queryKey: ['tasks'] });
  };

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('tasks' as any).update({ status }).eq('id', id);
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    qc.invalidateQueries({ queryKey: ['tasks'] });
  };

  const submitProof = async () => {
    if (!proofOpen || !staff?.user_id) return;
    setSubmitting(true);
    try {
      let path: string | null = proofOpen.proof_image_path || null;
      if (proofFile) {
        const compressed = await compressImage(proofFile);
        const newPath = `tasks/${staff.user_id}/${Date.now()}-${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage.from('attendance-media')
          .upload(newPath, compressed, { contentType: 'image/jpeg' });
        if (upErr) throw upErr;
        path = newPath;
      }
      const { error } = await supabase.from('tasks' as any).update({
        proof_image_path: path,
        staff_notes: proofNotes || proofOpen.staff_notes,
        status: 'completed',
      }).eq('id', proofOpen.id);
      if (error) throw error;
      toast({ title: 'Task completed' });
      setProofOpen(null); setProofFile(null); setProofNotes('');
      qc.invalidateQueries({ queryKey: ['tasks'] });
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    } finally { setSubmitting(false); }
  };

  const pendingCount = (tasks || []).filter((x: any) => x.status === 'pending').length;
  const inProgressCount = (tasks || []).filter((x: any) => x.status === 'in_progress').length;
  const doneCount = (tasks || []).filter((x: any) => x.status === 'completed').length;

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6 animate-in-up">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-display">Tasks</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isAdminOrOp ? 'Assign and track extra work for sales persons.' : 'Your assigned tasks.'}
          </p>
        </div>
        {isAdminOrOp && (
          <Button onClick={() => setCreateOpen(true)} className="btn-glow text-primary-foreground">
            <Plus className="h-4 w-4 mr-1" /> Assign task
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Pending', value: pendingCount, color: 'text-warning' },
          { label: 'In Progress', value: inProgressCount, color: 'text-info' },
          { label: 'Completed', value: doneCount, color: 'text-success' },
        ].map((s) => (
          <div key={s.label} className="bento p-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{s.label}</p>
            <p className={`text-2xl font-extrabold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {!tasks?.length ? (
        <div className="bento p-8 text-center text-muted-foreground">No tasks yet.</div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task: any) => (
            <div key={task.id} className="bento p-4 space-y-2 hover:shadow-elevated transition-shadow">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{task.title}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(task.created_at), 'dd MMM HH:mm')}{task.due_date ? ` • Due ${format(new Date(task.due_date), 'dd MMM')}` : ''}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={priorityColor[task.priority]}>{task.priority}</Badge>
                  <Badge variant={task.status === 'completed' ? 'default' : 'outline'} className="capitalize">{task.status.replace('_', ' ')}</Badge>
                </div>
              </div>
              {task.description && <p className="text-sm text-foreground/80">{task.description}</p>}
              {task.staff_notes && <p className="text-xs text-muted-foreground">Notes: {task.staff_notes}</p>}

              {!isAdminOrOp && task.status !== 'completed' && (
                <div className="flex gap-2 pt-1">
                  {task.status === 'pending' && (
                    <Button size="sm" variant="outline" onClick={() => updateStatus(task.id, 'in_progress')}>Start</Button>
                  )}
                  <Button size="sm" className="btn-glow text-primary-foreground" onClick={() => { setProofOpen(task); setProofNotes(task.staff_notes || ''); }}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Mark complete
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create task dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Assign task</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Title</Label><Input value={t.title} onChange={(e) => setT({ ...t, title: e.target.value })} placeholder="Document collection, Site revisit…" /></div>
            <div className="space-y-1.5"><Label>Description</Label><Textarea rows={3} value={t.description} onChange={(e) => setT({ ...t, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Priority</Label>
                <Select value={t.priority} onValueChange={(v) => setT({ ...t, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['low', 'medium', 'high', 'urgent'].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Due date</Label><Input type="date" value={t.due_date} onChange={(e) => setT({ ...t, due_date: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Assign to</Label>
              <Select value={t.assigned_to_user_id} onValueChange={(v) => setT({ ...t, assigned_to_user_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select sales person" /></SelectTrigger>
                <SelectContent>
                  {(salesPersons || []).map((s) => <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={createTask} className="gradient-primary text-primary-foreground">Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Proof of completion dialog */}
      <Dialog open={!!proofOpen} onOpenChange={(o) => !o && setProofOpen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Complete task</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm font-medium">{proofOpen?.title}</p>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea rows={3} value={proofNotes} onChange={(e) => setProofNotes(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Proof photo (optional)</Label>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => setProofFile(e.target.files?.[0] || null)} />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Camera className="h-4 w-4 mr-1" />{proofFile ? proofFile.name.slice(0, 24) : 'Open camera'}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProofOpen(null)}>Cancel</Button>
            <Button onClick={submitProof} disabled={submitting} className="gradient-primary text-primary-foreground">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />} Mark complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Tasks;
