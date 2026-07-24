import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Zap } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type StructureType = Database['public']['Enums']['structure_type'];
type PaymentType = Database['public']['Enums']['payment_type'];

const structureOptions: { value: StructureType; label: string }[] = [
  { value: 'rcc_roof', label: 'RCC Roof' },
  { value: 'tin_shed_roof', label: 'Tin Shed Roof' },
  { value: 'ground_mount', label: 'Ground Mount' },
];

type AppRole = Database['public']['Enums']['app_role'];

const ASSIGNABLE_ROLES: { key: 'assigned_sales_person_id' | 'assigned_telecaller_id' | 'assigned_operator_id' | 'assigned_welder_id' | 'assigned_electrician_id'; role: AppRole; label: string }[] = [
  { key: 'assigned_sales_person_id', role: 'sales_person', label: 'Sales Person' },
  { key: 'assigned_telecaller_id', role: 'telecaller', label: 'Telecaller' },
  { key: 'assigned_operator_id', role: 'operator', label: 'Operator' },
  { key: 'assigned_welder_id', role: 'welder', label: 'Welder' },
  { key: 'assigned_electrician_id', role: 'electrician', label: 'Electrician' },
];

const UNASSIGNED = '__unassigned__';

const ProjectFinalizationForm = () => {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { projectId } = useParams<{ projectId: string }>();
  const leadId = searchParams.get('leadId');
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);
  const isAdmin = role === 'admin';
  const [staffByRole, setStaffByRole] = useState<Record<string, { user_id: string; full_name: string }[]>>({});
  const [assignments, setAssignments] = useState<Record<string, string | null>>({
    assigned_sales_person_id: null,
    assigned_telecaller_id: null,
    assigned_operator_id: null,
    assigned_welder_id: null,
    assigned_electrician_id: null,
  });

  const [form, setForm] = useState({
    k_number: '',
    capacity_kw: '',
    panel_watt: '',
    panel_qty: '',
    panel_brand: '',
    inverter_capacity: '',
    inverter_brand: '',
    structure_type: '' as StructureType | '',
    final_amount: '',
    discount: '',
    payment_type: '' as PaymentType | '',
    loan_bank: '',
    expected_install_date: '',
    special_notes: '',
  });

  const updateField = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  useEffect(() => {
    const fetchProject = async () => {
      if (!projectId) return;
      setPageLoading(true);
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

      if (error || !data) {
        toast({ title: 'Project not found', variant: 'destructive' });
        navigate('/admin/projects');
        return;
      }

      setForm({
        k_number: data.k_number ?? '',
        capacity_kw: String(data.capacity_kw ?? ''),
        panel_watt: String(data.panel_watt ?? ''),
        panel_qty: String(data.panel_qty ?? ''),
        panel_brand: data.panel_brand ?? '',
        inverter_capacity: String(data.inverter_capacity ?? ''),
        inverter_brand: data.inverter_brand ?? '',
        structure_type: data.structure_type,
        final_amount: String(data.final_amount ?? ''),
        discount: String(data.discount ?? ''),
        payment_type: data.payment_type,
        loan_bank: data.loan_bank ?? '',
        expected_install_date: data.expected_install_date?.split('T')[0] ?? '',
        special_notes: data.special_notes ?? '',
      });
      setAssignments({
        assigned_sales_person_id: data.assigned_sales_person_id ?? null,
        assigned_telecaller_id: (data as any).assigned_telecaller_id ?? null,
        assigned_operator_id: (data as any).assigned_operator_id ?? null,
        assigned_welder_id: data.assigned_welder_id ?? null,
        assigned_electrician_id: data.assigned_electrician_id ?? null,
      });
      setPageLoading(false);
    };

    fetchProject();
  }, [projectId, navigate, toast]);

  // Fetch Lead Details to pre-fill if creating a new project/deal
  useEffect(() => {
    const fetchLeadAndPreFill = async () => {
      if (projectId || !leadId) return;
      setPageLoading(true);
      try {
        const { data, error } = await supabase
          .from('leads')
          .select('k_number, kw_interest, plant_details, quotation_details, notes')
          .eq('id', leadId)
          .single();

        if (error) throw error;
        if (data) {
          const plant = data.plant_details as any || {};
          
          let quote = {} as any;
          if (Array.isArray(data.quotation_details)) {
            quote = data.quotation_details.find((q: any) => q?.status === 'accepted') || data.quotation_details[0] || {};
          } else if (data.quotation_details && typeof data.quotation_details === 'object') {
            quote = data.quotation_details;
          }
          
          const rawCapacity = quote.capacity_kw ? String(quote.capacity_kw) : (data.kw_interest ? String(data.kw_interest) : (plant.inverter_wt ? String(plant.inverter_wt).replace(/[^0-9.]/g, '') : ''));
          const rawPanelWatt = quote.panel_watt ? String(quote.panel_watt) : (plant.panel_wt ? String(plant.panel_wt).replace(/[^0-9.]/g, '') : '');
          const rawPanelQty = quote.panel_qty ? String(quote.panel_qty) : (plant.panel_qty ? String(plant.panel_qty) : '');
          const rawInvCapacity = quote.inverter_capacity ? String(quote.inverter_capacity) : (plant.inverter_wt ? String(plant.inverter_wt).replace(/[^0-9.]/g, '') : '');
          
          setForm({
            k_number: data.k_number || '',
            capacity_kw: rawCapacity,
            panel_watt: rawPanelWatt,
            panel_qty: rawPanelQty,
            panel_brand: quote.panel_brand || plant.panel_make || '',
            inverter_capacity: rawInvCapacity || rawCapacity,
            inverter_brand: quote.inverter_brand || plant.inverter || '',
            structure_type: quote.structure_type || plant.structure_type_gauge_make || '',
            final_amount: quote.quote_price ? String(quote.quote_price) : (plant.total_cost ? String(plant.total_cost) : ''),
            discount: plant.discount_amount ? String(plant.discount_amount) : '',
            payment_type: '',
            loan_bank: '',
            expected_install_date: '',
            special_notes: data.notes || '',
          });
        }
      } catch (err: any) {
        console.error('Error pre-filling lead data:', err);
      } finally {
        setPageLoading(false);
      }
    };

    fetchLeadAndPreFill();
  }, [projectId, leadId]);

  // Admin: load staff lists per role for assignment dropdowns
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const { data: rolesData } = await supabase.from('user_roles').select('user_id, role');
      const { data: staffData } = await supabase.from('staff').select('user_id, full_name, is_active').eq('is_active', true);
      if (!rolesData || !staffData) return;
      const nameById = new Map(staffData.map(s => [s.user_id, s.full_name]));
      const grouped: Record<string, { user_id: string; full_name: string }[]> = {};
      for (const r of rolesData) {
        if (!nameById.has(r.user_id)) continue;
        (grouped[r.role] ||= []).push({ user_id: r.user_id, full_name: nameById.get(r.user_id)! });
      }
      setStaffByRole(grouped);
    })();
  }, [isAdmin]);

  const handleSubmit = async () => {
    if (!projectId && !leadId) { toast({ title: 'Missing lead', variant: 'destructive' }); return; }
    if (!form.k_number.trim()) { toast({ title: 'K Number required', variant: 'destructive' }); return; }
    if (!form.capacity_kw) { toast({ title: 'Plant capacity required', variant: 'destructive' }); return; }

    setLoading(true);
    try {
      const parseNum = (val: any) => {
        const n = parseFloat(String(val));
        return isNaN(n) ? null : n;
      };
      const parseIntNum = (val: any) => {
        const n = parseInt(String(val), 10);
        return isNaN(n) ? null : n;
      };

      let project;

      if (projectId) {
        const updatePayload: any = {
          k_number: form.k_number.trim(),
          capacity_kw: parseNum(form.capacity_kw) || null,
          panel_watt: parseIntNum(form.panel_watt),
          panel_qty: parseIntNum(form.panel_qty),
          panel_brand: form.panel_brand.trim() || null,
          inverter_capacity: parseNum(form.inverter_capacity),
          inverter_brand: form.inverter_brand.trim() || null,
          structure_type: form.structure_type as StructureType || null,
          final_amount: parseNum(form.final_amount) || null,
          discount: form.discount ? parseFloat(form.discount) : 0,
          payment_type: form.payment_type as PaymentType || null,
          loan_bank: form.payment_type === 'loan' ? form.loan_bank.trim() : null,
          expected_install_date: form.expected_install_date || null,
          special_notes: form.special_notes.trim() || null,
        };
        if (isAdmin) {
          for (const r of ASSIGNABLE_ROLES) updatePayload[r.key] = assignments[r.key] || null;
        }
        const { data, error } = await supabase
          .from('projects')
          .update(updatePayload)
          .eq('id', projectId)
          .select()
          .single();

        if (error) throw error;
        project = data;
      } else {
        const { data: projectCode, error: codeError } = await supabase.rpc('generate_project_code');
        if (codeError) throw codeError;

        const { data, error } = await supabase.from('projects').insert({
          lead_id: leadId,
          project_code: projectCode as string,
          k_number: form.k_number.trim(),
          capacity_kw: parseNum(form.capacity_kw) || null,
          panel_watt: parseIntNum(form.panel_watt),
          panel_qty: parseIntNum(form.panel_qty),
          panel_brand: form.panel_brand.trim() || null,
          inverter_capacity: parseNum(form.inverter_capacity),
          inverter_brand: form.inverter_brand.trim() || null,
          structure_type: form.structure_type as StructureType || null,
          final_amount: parseNum(form.final_amount) || null,
          discount: form.discount ? parseFloat(form.discount) : 0,
          payment_type: form.payment_type as PaymentType || null,
          loan_bank: form.payment_type === 'loan' ? form.loan_bank.trim() : null,
          expected_install_date: form.expected_install_date || null,
          special_notes: form.special_notes.trim() || null,
          created_by_user_id: user!.id,
          assigned_sales_person_id: user!.id,
          // New pipeline stage. 'pending_documents' is the legacy value and
          // would create the project off-pipeline.
          status: 'documents_pending',
        }).select().single();

        if (error) throw error;
        project = data;

        await supabase.from('leads').update({ status: 'interested' }).eq('id', leadId);
      }

      toast({
        title: projectId ? 'Deal Updated!' : 'Deal Created!',
        description: projectId ? 'Deal details saved successfully.' : `Deal ${project.project_code} created. You can now manage documents and quotations on the Deals Dashboard.`,
      });
      navigate('/deals');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (pageLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading project...</div>;
  }

  if (!projectId && !leadId) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        No lead selected. Go back and finalize a lead first.
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back
      </Button>

      <Card className="shadow-elevated border-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Zap className="h-5 w-5 text-primary" /> {projectId ? 'Edit Project' : 'Finalize Project'}
          </CardTitle>
          <p className="text-sm text-muted-foreground">Fill in the solar system specifications and pricing</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* K Number */}
          <div className="space-y-1.5">
            <Label>K Number (Electricity Consumer Number) *</Label>
            <Input value={form.k_number} onChange={e => updateField('k_number', e.target.value)} placeholder="Electricity K Number" className="h-11" />
          </div>

          {/* Capacity */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Plant Capacity (kW) *</Label>
              <Input type="number" value={form.capacity_kw} onChange={e => updateField('capacity_kw', e.target.value)} placeholder="e.g. 3" className="h-11" min={0} step={0.5} />
            </div>
            <div className="space-y-1.5">
              <Label>Panel Watt *</Label>
              <Input type="number" value={form.panel_watt} onChange={e => updateField('panel_watt', e.target.value)} placeholder="e.g. 545" className="h-11" min={0} />
            </div>
          </div>

          {/* Panel details */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Panel Quantity *</Label>
              <Input type="number" value={form.panel_qty} onChange={e => updateField('panel_qty', e.target.value)} placeholder="e.g. 6" className="h-11" min={1} />
            </div>
            <div className="space-y-1.5">
              <Label>Panel Brand *</Label>
              <Input value={form.panel_brand} onChange={e => updateField('panel_brand', e.target.value)} placeholder="Brand name" className="h-11" />
            </div>
          </div>

          {/* Inverter */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Inverter Capacity (kW) *</Label>
              <Input type="number" value={form.inverter_capacity} onChange={e => updateField('inverter_capacity', e.target.value)} placeholder="e.g. 3" className="h-11" min={0} step={0.5} />
            </div>
            <div className="space-y-1.5">
              <Label>Inverter Brand & Model *</Label>
              <Input value={form.inverter_brand} onChange={e => updateField('inverter_brand', e.target.value)} placeholder="Brand and model" className="h-11" />
            </div>
          </div>

          {/* Structure type */}
          <div className="space-y-1.5">
            <Label>Structure Type *</Label>
            <Select value={form.structure_type} onValueChange={v => updateField('structure_type', v)}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Select structure type" /></SelectTrigger>
              <SelectContent>
                {structureOptions.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Amount */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Final Amount - GST Paid (₹) *</Label>
              <Input type="number" value={form.final_amount} onChange={e => updateField('final_amount', e.target.value)} placeholder="GST paid total amount" className="h-11" min={0} />
            </div>
            <div className="space-y-1.5">
              <Label>Discount (₹)</Label>
              <Input type="number" value={form.discount} onChange={e => updateField('discount', e.target.value)} placeholder="0" className="h-11" min={0} />
            </div>
          </div>

          {/* Payment type */}
          <div className="space-y-1.5">
            <Label>Payment Type *</Label>
            <Select value={form.payment_type} onValueChange={v => updateField('payment_type', v)}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Cash or Loan" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="loan">Loan</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Loan bank (conditional) */}
          {form.payment_type === 'loan' && (
            <div className="space-y-1.5">
              <Label>Loan Bank Name *</Label>
              <Input value={form.loan_bank} onChange={e => updateField('loan_bank', e.target.value)} placeholder="Bank name" className="h-11" />
            </div>
          )}

          {/* Expected install date */}
          <div className="space-y-1.5">
            <Label>Expected Installation Date</Label>
            <Input type="date" value={form.expected_install_date} onChange={e => updateField('expected_install_date', e.target.value)} className="h-11" />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Special Notes</Label>
            <Textarea value={form.special_notes} onChange={e => updateField('special_notes', e.target.value)} placeholder="Any special instructions" rows={2} />
          </div>

          {/* Admin-only: Assignments */}
          {isAdmin && projectId && (
            <div className="space-y-3 pt-2 border-t border-border">
              <Label className="text-base font-semibold">Assignments</Label>
              <p className="text-xs text-muted-foreground -mt-2">Assign staff for each role. Leave unassigned if not applicable.</p>
              {ASSIGNABLE_ROLES.map(r => (
                <div key={r.key} className="space-y-1.5">
                  <Label className="text-sm">{r.label}</Label>
                  <Select
                    value={assignments[r.key] || UNASSIGNED}
                    onValueChange={v => setAssignments(prev => ({ ...prev, [r.key]: v === UNASSIGNED ? null : v }))}
                  >
                    <SelectTrigger className="h-11"><SelectValue placeholder={`Select ${r.label}`} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED}>— Unassigned —</SelectItem>
                      {(staffByRole[r.role] || []).map(s => (
                        <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}

          <Button
            onClick={handleSubmit}
            className="w-full h-12 gradient-primary text-primary-foreground font-semibold mt-2"
            disabled={loading}
          >
              {loading ? (projectId ? 'Saving Changes...' : 'Creating Project...') : (projectId ? 'Save Changes' : 'Create Project & Upload Documents')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProjectFinalizationForm;
