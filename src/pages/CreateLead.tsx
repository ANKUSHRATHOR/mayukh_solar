import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, PhoneCall, AlertTriangle } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type LeadSource = Database['public']['Enums']['lead_source'];

const sourceOptions: { value: LeadSource; label: string }[] = [
  { value: 'phone_call', label: 'Phone Call' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'reference', label: 'Reference' },
  { value: 'camp', label: 'Camp' },
  { value: 'online', label: 'Online' },
];

interface DuplicateInfo {
  id: string;
  customer_name: string;
  status: string;
  created_at: string;
}

const CreateLead = () => {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [duplicate, setDuplicate] = useState<DuplicateInfo | null>(null);
  const [duplicateChecked, setDuplicateChecked] = useState(false);

  const [form, setForm] = useState({
    customer_name: '',
    mobile: '',
    alt_mobile: '',
    village_city: '',
    district: '',
    state: '',
    address: '',
    kw_interest: '',
    source: '' as LeadSource | '',
    reference_name: '',
    notes: '',
  });

  const updateField = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (field === 'mobile') {
      setDuplicate(null);
      setDuplicateChecked(false);
    }
  };

  const validateMobile = (num: string) => /^[6-9]\d{9}$/.test(num);

  const checkDuplicate = async () => {
    if (!validateMobile(form.mobile)) return;
    const { data } = await supabase.rpc('check_duplicate_lead', { _mobile: form.mobile });
    if (data && data.length > 0) {
      setDuplicate(data[0] as DuplicateInfo);
    } else {
      setDuplicate(null);
    }
    setDuplicateChecked(true);
  };

  const handleSubmit = async () => {
    if (!form.customer_name.trim()) { toast({ title: 'Customer name required', variant: 'destructive' }); return; }
    if (!validateMobile(form.mobile)) { toast({ title: 'Invalid mobile number', description: 'Enter a valid 10-digit number starting with 6-9', variant: 'destructive' }); return; }
    if (!form.village_city.trim()) { toast({ title: 'Village/City required', variant: 'destructive' }); return; }
    if (!form.district.trim()) { toast({ title: 'District required', variant: 'destructive' }); return; }
    if (!form.state.trim()) { toast({ title: 'State required', variant: 'destructive' }); return; }
    if (!form.address.trim()) { toast({ title: 'Full address required', variant: 'destructive' }); return; }
    if (!form.source) { toast({ title: 'Lead source required', variant: 'destructive' }); return; }

    // Check duplicate if not checked yet
    if (!duplicateChecked) {
      await checkDuplicate();
      return;
    }

    // If duplicate and telecaller, block
    if (duplicate && role === 'telecaller') {
      toast({ title: 'Duplicate lead', description: 'This mobile number already exists. Contact Admin to override.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('leads').insert({
        created_by_user_id: user!.id,
        customer_name: form.customer_name.trim(),
        mobile: form.mobile,
        alt_mobile: form.alt_mobile || null,
        village_city: form.village_city.trim(),
        district: form.district.trim(),
        state: form.state.trim(),
        address: form.address.trim(),
        kw_interest: form.kw_interest ? parseFloat(form.kw_interest) : null,
        source: form.source as LeadSource,
        reference_name: form.source === 'reference' ? form.reference_name.trim() || null : null,
        notes: form.notes.trim() || null,
      });
      if (error) throw error;

      toast({ title: 'Lead created!', description: `${form.customer_name} has been added.` });
      navigate(-1);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => navigate(-1)} className="mb-2">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back
      </Button>

      <Card className="shadow-elevated border-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <PhoneCall className="h-5 w-5 text-primary" /> Create New Lead
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Customer Name */}
          <div className="space-y-1.5">
            <Label>Customer Name *</Label>
            <Input value={form.customer_name} onChange={e => updateField('customer_name', e.target.value)} placeholder="Full name" className="h-11" />
          </div>

          {/* Mobile */}
          <div className="space-y-1.5">
            <Label>Mobile Number *</Label>
            <Input
              type="tel"
              value={form.mobile}
              onChange={e => updateField('mobile', e.target.value.replace(/\D/g, '').slice(0, 10))}
              onBlur={checkDuplicate}
              placeholder="10-digit mobile number"
              className="h-11"
              maxLength={10}
            />
          </div>

          {/* Duplicate Warning */}
          {duplicate && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Duplicate Found!</AlertTitle>
              <AlertDescription>
                <strong>{duplicate.customer_name}</strong> already exists with this number.
                Status: <strong>{duplicate.status.replace('_', ' ')}</strong>.
                {role === 'telecaller' && ' Contact Admin to override.'}
                {role === 'admin' && (
                  <Button size="sm" variant="outline" className="mt-2 block" onClick={() => setDuplicate(null)}>
                    Create Anyway (Admin Override)
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Alternate Mobile */}
          <div className="space-y-1.5">
            <Label>Alternate Mobile</Label>
            <Input
              type="tel"
              value={form.alt_mobile}
              onChange={e => updateField('alt_mobile', e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="Optional"
              className="h-11"
              maxLength={10}
            />
          </div>

          {/* Village/City */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Village / City *</Label>
              <Input value={form.village_city} onChange={e => updateField('village_city', e.target.value)} placeholder="Village or city" className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label>District *</Label>
              <Input value={form.district} onChange={e => updateField('district', e.target.value)} placeholder="District" className="h-11" />
            </div>
          </div>

          {/* State */}
          <div className="space-y-1.5">
            <Label>State *</Label>
            <Input value={form.state} onChange={e => updateField('state', e.target.value)} placeholder="State" className="h-11" />
          </div>

          {/* Full Address */}
          <div className="space-y-1.5">
            <Label>Full Address *</Label>
            <Textarea value={form.address} onChange={e => updateField('address', e.target.value)} placeholder="Complete address" rows={2} />
          </div>

          {/* kW Interest */}
          <div className="space-y-1.5">
            <Label>Interested In (kW)</Label>
            <Input
              type="number"
              value={form.kw_interest}
              onChange={e => updateField('kw_interest', e.target.value)}
              placeholder="e.g. 3, 5, 10"
              className="h-11"
              min={0}
              step={0.5}
            />
          </div>

          {/* Source */}
          <div className="space-y-1.5">
            <Label>Lead Source *</Label>
            <Select value={form.source} onValueChange={v => updateField('source', v)}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Select source" /></SelectTrigger>
              <SelectContent>
                {sourceOptions.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reference Name (conditional) */}
          {form.source === 'reference' && (
            <div className="space-y-1.5">
              <Label>Reference Name</Label>
              <Input value={form.reference_name} onChange={e => updateField('reference_name', e.target.value)} placeholder="Who referred?" className="h-11" />
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={e => updateField('notes', e.target.value)} placeholder="Any additional notes" rows={2} />
          </div>

          <Button
            onClick={handleSubmit}
            className="w-full h-12 gradient-primary text-primary-foreground font-semibold mt-2"
            disabled={loading}
          >
            {loading ? 'Creating...' : 'Create Lead'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default CreateLead;
