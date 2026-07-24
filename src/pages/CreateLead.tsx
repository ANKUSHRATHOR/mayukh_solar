import { useEffect, useState } from 'react';
import { useStickyState } from '@/hooks/useStickyState';
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
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, ArrowRight, CheckCircle2, AlertTriangle,
  Zap, User, Phone as PhoneIcon, MapPin, RefreshCw,
  SkipForward, Building2
} from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import { fetchConsumerDetails } from '@/lib/discom';

type LeadSource = Database['public']['Enums']['lead_source'];
type AssignableSalesPerson = Database['public']['Functions']['get_assignable_sales_persons']['Returns'][number];

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

interface KnoData {
  name: string;
  address: string;
  kno: string;
  billno?: string;
  binder?: string;
  account?: string;
  meterno?: string;
  connload?: string;
  sancload?: string;
  solarloadkw?: string;
  category?: string;
  tariffcode?: string;
  officename?: string;
  latitude?: string;
  longitude?: string;
  [key: string]: any;
}

type Step = 'kno' | 'contact' | 'submit';

const STEPS: Step[] = ['kno', 'contact', 'submit'];
const STEP_LABELS: Record<Step, string> = {
  kno: 'Connection',
  contact: 'Contact',
  submit: 'Submit',
};

const CreateLead = () => {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // ------------- step state -------------
  const [step, setStep] = useState<Step>('kno');

  // ------------- K-Number / Discom -------------
  const [kNumber, setKNumber] = useStickyState<string>(`cl:kno:${user?.id}`, '');
  const [knoData, setKnoData] = useStickyState<KnoData | null>(`cl:knodata:${user?.id}`, null);
  const [fetchingKno, setFetchingKno] = useState(false);
  const [knoSkipped, setKnoSkipped] = useState(false);

  // ------------- Contact Details -------------
  const [customerName, setCustomerName] = useStickyState(`cl:name:${user?.id}`, '');
  const [mobile, setMobile] = useStickyState(`cl:mob:${user?.id}`, '');
  const [altMobile, setAltMobile] = useStickyState(`cl:altmob:${user?.id}`, '');
  const [email, setEmail] = useStickyState(`cl:email:${user?.id}`, '');
  const [address, setAddress] = useStickyState(`cl:addr:${user?.id}`, '');
  const [villageCity, setVillageCity] = useStickyState(`cl:city:${user?.id}`, '');
  const [district, setDistrict] = useStickyState(`cl:dist:${user?.id}`, '');
  const [state, setState] = useStickyState(`cl:state:${user?.id}`, 'Rajasthan');

  // ------------- Source & Extras -------------
  const [source, setSource] = useStickyState<LeadSource | ''>(`cl:src:${user?.id}`, '');
  const [referenceName, setReferenceName] = useStickyState(`cl:ref:${user?.id}`, '');
  const [kwInterest, setKwInterest] = useStickyState(`cl:kw:${user?.id}`, '');
  const [notes, setNotes] = useStickyState(`cl:notes:${user?.id}`, '');

  // ------------- Sales Assignment -------------
  const [assignedToUserId, setAssignedToUserId] = useStickyState(`cl:assignee:${user?.id ?? 'anon'}`, '');
  const [salesPersons, setSalesPersons] = useState<AssignableSalesPerson[]>([]);

  // ------------- Duplicate check -------------
  const [duplicate, setDuplicate] = useState<DuplicateInfo | null>(null);
  const [duplicateChecked, setDuplicateChecked] = useState(false);

  const [loading, setLoading] = useState(false);

  const isSalesPerson = role === 'sales_person';
  const canAssign = role === 'admin' || role === 'telecaller';

  // Sales persons always auto-assign to self
  useEffect(() => {
    if (isSalesPerson && user?.id && assignedToUserId !== user.id) {
      setAssignedToUserId(user.id);
    }
  }, [isSalesPerson, user?.id]);

  useEffect(() => {
    if (!canAssign) return;
    supabase.rpc('get_assignable_sales_persons').then(({ data, error }) => {
      if (!error) setSalesPersons((data as AssignableSalesPerson[]) || []);
    });
  }, [canAssign]);

  // ----------------------------------------------------------------
  // STEP 1: Fetch Discom details
  // ----------------------------------------------------------------
  const handleKnoFetch = async () => {
    if (kNumber.length !== 12) {
      toast({ title: 'Invalid K-Number', description: 'Must be exactly 12 digits.', variant: 'destructive' });
      return;
    }
    setFetchingKno(true);
    try {
      const response = await fetchConsumerDetails(kNumber);
      if (response?.ok && response.data?.KNO) {
        const data: KnoData = response.data.KNO;
        setKnoData(data);

        // Auto-populate customer name if not already set
        if (!customerName && data.name) setCustomerName(data.name);

        // Auto-populate kW interest from Discom load
        if (!kwInterest) {
          const kw = data.solarloadkw || data.connload || '';
          setKwInterest(String(kw));
        }

        // Smart city/district from Discom address
        const addrLower = (data.address || '').toLowerCase();
        const officeLower = (data.officename || '').toLowerCase();
        if (!villageCity) {
          if (addrLower.includes('kota') || officeLower.includes('kota')) {
            setVillageCity('Kota');
            setDistrict('Kota');
          } else if (addrLower.includes('jaipur') || officeLower.includes('jaipur')) {
            setVillageCity('Jaipur');
            setDistrict('Jaipur');
          } else if (data.officename) {
            setVillageCity(data.officename);
            setDistrict(data.officename);
          }
        }

        toast({ title: '✓ Discom Details Loaded', description: `Consumer: ${data.name}` });
        setKnoSkipped(false);
      } else {
        toast({ title: 'No Record Found', description: 'K-Number not found in Discom. You can still create the lead manually.', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Fetch Error', description: err.message, variant: 'destructive' });
    } finally {
      setFetchingKno(false);
    }
  };

  const handleSkipKno = () => {
    setKnoSkipped(true);
    setKnoData(null);
    setStep('contact');
  };

  const proceedFromKno = () => {
    // K-Number present but not fetched yet? Try to fetch first.
    if (kNumber.length === 12 && !knoData) {
      handleKnoFetch().then(() => setStep('contact'));
    } else {
      setStep('contact');
    }
  };

  // ----------------------------------------------------------------
  // STEP 2: Duplicate check
  // ----------------------------------------------------------------
  const validateMobile = (num: string) => /^[6-9]\d{9}$/.test(num);

  const checkDuplicate = async () => {
    if (!validateMobile(mobile)) return false;
    const { data } = await supabase.rpc('check_duplicate_lead', { _mobile: mobile });
    const isDup = !!(data && data.length > 0);
    setDuplicate(isDup ? (data[0] as DuplicateInfo) : null);
    setDuplicateChecked(true);
    return isDup;
  };

  const proceedFromContact = async () => {
    if (!customerName.trim()) {
      toast({ title: 'Customer name required', variant: 'destructive' });
      return;
    }
    if (!validateMobile(mobile)) {
      toast({ title: 'Valid 10-digit mobile required', variant: 'destructive' });
      return;
    }
    // Duplicate check
    if (!duplicateChecked) {
      const isDup = await checkDuplicate();
      if (isDup) return; // warning is shown inline
    }
    if (duplicate && role === 'telecaller') {
      toast({ title: 'Duplicate — contact Admin to override', variant: 'destructive' });
      return;
    }
    setStep('submit');
  };

  // ----------------------------------------------------------------
  // STEP 3: Final Submit
  // ----------------------------------------------------------------
  const handleSubmit = async () => {
    if (!user) {
      toast({ title: 'Authentication required', description: 'Please log in again.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const parseNum = (val: any) => {
        const n = parseFloat(String(val));
        return isNaN(n) ? null : n;
      };

      // Build insert payload — only include optional new columns when they have values
      // to avoid PostgREST schema-cache errors if migration hasn't refreshed yet
      const insertPayload: Record<string, any> = {
        created_by_user_id: user!.id,
        assigned_to_user_id: assignedToUserId || null,
        customer_name: customerName.trim(),
        mobile,
        alt_mobile: altMobile || null,
        village_city: villageCity.trim() || 'Rajasthan',
        district: district.trim() || 'Rajasthan',
        state: state.trim() || 'Rajasthan',
        address: address.trim() || '',
        kw_interest: parseNum(kwInterest),
        source: (source as LeadSource) || 'phone_call',
        reference_name: source === 'reference' ? referenceName.trim() || null : null,
        notes: notes.trim() || null,
      };
      // Conditionally add new columns only if they have a value
      if (email.trim()) insertPayload['email'] = email.trim();
      if (kNumber) insertPayload['k_number'] = kNumber;
      if (knoData) insertPayload['kno_details'] = knoData;
      if (knoData?.latitude) insertPayload['latitude'] = parseNum(knoData.latitude);
      if (knoData?.longitude) insertPayload['longitude'] = parseNum(knoData.longitude);

      const { error } = await supabase.from('leads').insert(insertPayload);

      if (error) throw error;

      toast({ title: 'Lead Created!', description: `${customerName} has been added successfully.` });

      // Reset all sticky states
      setKNumber('');
      setKnoData(null);
      setCustomerName('');
      setMobile('');
      setAltMobile('');
      setEmail('');
      setAddress('');
      setVillageCity('');
      setDistrict('');
      setState('Rajasthan');
      setSource('');
      setReferenceName('');
      setKwInterest('');
      setNotes('');
      setAssignedToUserId('');
      setDuplicate(null);
      setDuplicateChecked(false);
      setStep('kno');

      navigate(-1);
    } catch (err: any) {
      toast({ title: 'Error creating lead', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // ----------------------------------------------------------------
  // UI Helpers
  // ----------------------------------------------------------------
  const stepIndex = STEPS.indexOf(step);

  const StepIndicator = () => (
    <div className="flex items-center gap-0 mb-6">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center flex-1 last:flex-none">
          <button
            onClick={() => i < stepIndex && setStep(s)}
            className={`flex items-center gap-1.5 text-xs font-semibold transition-all ${
              i < stepIndex
                ? 'text-primary cursor-pointer hover:underline'
                : i === stepIndex
                ? 'text-foreground'
                : 'text-muted-foreground cursor-default'
            }`}
          >
            <span className={`
              flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold border-2 shrink-0
              ${i < stepIndex
                ? 'bg-primary border-primary text-primary-foreground'
                : i === stepIndex
                ? 'bg-background border-primary text-primary'
                : 'bg-background border-border text-muted-foreground'}
            `}>
              {i < stepIndex ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
            </span>
            {STEP_LABELS[s]}
          </button>
          {i < STEPS.length - 1 && (
            <div className={`flex-1 h-0.5 mx-2 rounded ${i < stepIndex ? 'bg-primary' : 'bg-border'}`} />
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="p-4 lg:p-8 max-w-xl mx-auto">
      <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4 -ml-2">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back
      </Button>

      <div className="mb-5">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Create New Lead</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {step === 'kno' && 'Start by entering the customer\'s K-Number to fetch their Discom connection details.'}
          {step === 'contact' && 'Enter the customer\'s contact information. This can differ from the Discom address.'}
          {step === 'submit' && 'Review and confirm the lead details below.'}
        </p>
      </div>

      <StepIndicator />

      {/* ============================================================
          STEP 1: K-Number Lookup
      ============================================================ */}
      {step === 'kno' && (
        <Card className="shadow-elevated border-0">
          <CardHeader className="border-b bg-muted/20 pb-4">
            <CardTitle className="flex items-center gap-2 text-base font-bold">
              <Zap className="h-4 w-4 text-primary" /> Rajasthan Discom K-Number
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-5">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">K-Number (12 digits)</Label>
              <div className="flex gap-2">
                <Input
                  value={kNumber}
                  onChange={e => {
                    setKNumber(e.target.value.replace(/\D/g, '').slice(0, 12));
                    if (knoData) setKnoData(null); // reset if editing
                  }}
                  placeholder="e.g. 210721033383"
                  maxLength={12}
                  className="font-mono h-12 text-base tracking-[0.2em] text-center"
                  autoFocus
                />
                <Button
                  type="button"
                  disabled={fetchingKno || kNumber.length !== 12}
                  onClick={handleKnoFetch}
                  className="h-12 px-5 gradient-primary text-primary-foreground font-semibold shrink-0"
                >
                  {fetchingKno
                    ? <><RefreshCw className="h-4 w-4 animate-spin mr-1.5" /> Fetching…</>
                    : 'Fetch'}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Enter the 12-digit K-Number from the customer's electricity bill to auto-fill connection details.
              </p>
            </div>

            {/* Discom Preview Card */}
            {knoData && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    <span className="text-xs font-bold text-primary uppercase tracking-wider">Discom Connection Found</span>
                  </div>
                  <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">
                    KNO: {knoData.kno || kNumber}
                  </Badge>
                </div>
                <Separator className="bg-primary/10" />
                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Consumer Name</p>
                    <p className="font-bold text-foreground text-sm mt-0.5">{knoData.name}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Discom Address</p>
                    <p className="font-medium text-foreground mt-0.5 leading-relaxed">{knoData.address}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Meter No.</p>
                    <p className="font-semibold text-foreground mt-0.5 font-mono">{knoData.meterno || '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Load / Capacity</p>
                    <p className="font-semibold text-foreground mt-0.5">
                      {knoData.sancload || knoData.connload || '—'} kW
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Office</p>
                    <p className="font-semibold text-foreground mt-0.5">{knoData.officename || '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Category</p>
                    <p className="font-semibold text-foreground mt-0.5">{knoData.category || knoData.tariffcode || '—'}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-col gap-2 pt-1">
              <Button
                onClick={proceedFromKno}
                disabled={fetchingKno}
                className="w-full h-12 gradient-primary text-primary-foreground font-bold text-sm"
              >
                {knoData ? 'Continue with these details' : kNumber.length === 12 ? 'Fetch & Continue' : 'Continue →'}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>

              {!knoData && (
                <Button
                  variant="ghost"
                  onClick={handleSkipKno}
                  className="w-full h-10 text-xs text-muted-foreground font-medium"
                >
                  <SkipForward className="mr-1.5 h-3.5 w-3.5" />
                  Skip K-Number — I'll enter contact details manually
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============================================================
          STEP 2: Contact Details
      ============================================================ */}
      {step === 'contact' && (
        <Card className="shadow-elevated border-0">
          <CardHeader className="border-b bg-muted/20 pb-4">
            <CardTitle className="flex items-center gap-2 text-base font-bold">
              <User className="h-4 w-4 text-primary" /> Customer Contact Details
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-5">
            {/* Show K-Number chip if we have it */}
            {kNumber && knoData && (
              <div className="flex items-center gap-2 text-xs text-primary bg-primary/5 border border-primary/20 px-3 py-2 rounded-lg">
                <Zap className="h-3.5 w-3.5 shrink-0" />
                <span>Connection linked: <strong className="font-mono">{kNumber}</strong> — {knoData.name}</span>
              </div>
            )}
            {knoSkipped && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 border border-dashed px-3 py-2 rounded-lg">
                <SkipForward className="h-3.5 w-3.5 shrink-0" />
                <span>No K-Number — Contact details only. You can sync Discom later from the lead page.</span>
              </div>
            )}

            {/* Name */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Customer Name *</Label>
              <Input
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="Full name of consumer"
                className="h-11"
                autoFocus
              />
            </div>

            {/* Mobile row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Mobile Number *</Label>
                <Input
                  type="tel"
                  value={mobile}
                  onChange={e => {
                    setMobile(e.target.value.replace(/\D/g, '').slice(0, 10));
                    setDuplicate(null);
                    setDuplicateChecked(false);
                  }}
                  onBlur={checkDuplicate}
                  placeholder="10-digit mobile"
                  className="h-11 font-semibold"
                  maxLength={10}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Alternate Mobile</Label>
                <Input
                  type="tel"
                  value={altMobile}
                  onChange={e => setAltMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="Optional"
                  className="h-11"
                  maxLength={10}
                />
              </div>
            </div>

            {/* Duplicate Warning */}
            {duplicate && (
              <Alert variant="destructive" className="rounded-xl border border-destructive/20 bg-destructive/5">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle className="font-bold text-sm">Duplicate Mobile Found!</AlertTitle>
                <AlertDescription className="text-xs mt-1">
                  <strong>{duplicate.customer_name}</strong> already has a lead with this number.
                  Status: <strong>{duplicate.status.replace('_', ' ')}</strong>.
                  {role === 'telecaller' && ' Contact Admin to override.'}
                  {role === 'admin' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 block h-8 text-xs"
                      onClick={() => { setDuplicate(null); setDuplicateChecked(true); }}
                    >
                      Continue Anyway (Admin Override)
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Email */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Email Address</Label>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="customer@email.com (optional)"
                className="h-11"
              />
            </div>

            <Separator />

            {/* Contact Address — independent of Discom address */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                Contact Address
                <span className="text-muted-foreground font-normal">(can be different from Discom address)</span>
              </Label>
              <Textarea
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="House no., street, area — where to send documents or visit"
                rows={2}
                className="text-sm rounded-xl"
              />
            </div>

            {/* City / District / State */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Village / City</Label>
                <Input
                  value={villageCity}
                  onChange={e => setVillageCity(e.target.value)}
                  placeholder="e.g. Kota"
                  className="h-10 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">District</Label>
                <Input
                  value={district}
                  onChange={e => setDistrict(e.target.value)}
                  placeholder="e.g. Kota"
                  className="h-10 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">State</Label>
                <Input
                  value={state}
                  onChange={e => setState(e.target.value)}
                  placeholder="Rajasthan"
                  className="h-10 text-xs"
                />
              </div>
            </div>

            {/* Navigation */}
            <div className="flex gap-3 pt-1">
              <Button variant="outline" onClick={() => setStep('kno')} className="h-11">
                <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
              </Button>
              <Button
                onClick={proceedFromContact}
                className="flex-1 h-11 gradient-primary text-primary-foreground font-bold"
              >
                Review & Submit <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============================================================
          STEP 3: Review + Source + Submit
      ============================================================ */}
      {step === 'submit' && (
        <div className="space-y-4">
          {/* Summary card */}
          <Card className="shadow-elevated border-0">
            <CardHeader className="border-b bg-muted/20 pb-4">
              <CardTitle className="flex items-center gap-2 text-base font-bold">
                <CheckCircle2 className="h-4 w-4 text-primary" /> Lead Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              {/* Contact */}
              <div className="space-y-2 text-sm">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Contact Details</p>
                <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/20 p-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">Name</p>
                    <p className="font-bold text-foreground">{customerName}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Mobile</p>
                    <p className="font-bold text-foreground flex items-center gap-1">
                      <PhoneIcon className="h-3 w-3" /> {mobile}
                    </p>
                  </div>
                  {email && (
                    <div className="col-span-2">
                      <p className="text-muted-foreground">Email</p>
                      <p className="font-semibold text-foreground">{email}</p>
                    </div>
                  )}
                  {address && (
                    <div className="col-span-2">
                      <p className="text-muted-foreground">Contact Address</p>
                      <p className="font-semibold text-foreground">{address}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-muted-foreground">City / District</p>
                    <p className="font-semibold text-foreground">{villageCity || '—'} / {district || '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">State</p>
                    <p className="font-semibold text-foreground">{state}</p>
                  </div>
                </div>
              </div>

              {/* Discom Connection */}
              {knoData && (
                <div className="space-y-2 text-sm">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Discom Connection</p>
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-muted-foreground">K-Number</p>
                      <p className="font-mono font-bold text-foreground">{kNumber}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Consumer</p>
                      <p className="font-bold text-foreground">{knoData.name}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-muted-foreground">Discom Address</p>
                      <p className="font-semibold text-foreground">{knoData.address}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Load</p>
                      <p className="font-semibold text-foreground">{knoData.sancload || knoData.connload || '—'} kW</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Meter No.</p>
                      <p className="font-semibold font-mono text-foreground">{knoData.meterno || '—'}</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Source & Optional fields */}
          <Card className="shadow-card border-border">
            <CardContent className="pt-5 space-y-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground -mb-1">Additional Details</p>

              <div className="grid grid-cols-2 gap-3">
                {/* Interested kW */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Interested Size (kW)</Label>
                  <Input
                    type="number"
                    value={kwInterest}
                    onChange={e => setKwInterest(e.target.value)}
                    placeholder="e.g. 3, 5, 10"
                    className="h-10"
                    min={0}
                    step={0.5}
                  />
                </div>

                {/* Source */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Lead Source</Label>
                  <Select value={source} onValueChange={v => setSource(v as LeadSource)}>
                    <SelectTrigger className="h-10 text-sm">
                      <SelectValue placeholder="How did we get this?" />
                    </SelectTrigger>
                    <SelectContent>
                      {sourceOptions.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {source === 'reference' && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Reference Name</Label>
                  <Input
                    value={referenceName}
                    onChange={e => setReferenceName(e.target.value)}
                    placeholder="Who referred this customer?"
                    className="h-10"
                  />
                </div>
              )}

              {/* Assign Sales Person */}
              {canAssign && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Assign to Sales Person <span className="font-normal text-muted-foreground">(Optional — can be assigned later)</span></Label>
                  <Select
                    value={assignedToUserId || '__none__'}
                    onValueChange={v => setAssignedToUserId(v === '__none__' ? '' : v)}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Leave unassigned for now" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Leave unassigned</SelectItem>
                      {salesPersons.map(sp => (
                        <SelectItem key={sp.user_id} value={sp.user_id}>
                          {sp.full_name} • {sp.mobile}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {isSalesPerson && (
                <p className="text-xs text-muted-foreground bg-primary/5 p-3 rounded-lg border border-primary/10">
                  This lead will be auto-assigned to you.
                </p>
              )}

              {/* Notes */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Notes</Label>
                <Textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Any additional context, remarks, or requirements..."
                  rows={2}
                  className="text-sm rounded-xl"
                />
              </div>
            </CardContent>
          </Card>

          {/* Navigation + Submit */}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep('contact')} className="h-12">
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Edit
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 h-12 gradient-primary text-primary-foreground font-bold text-sm shadow-lg"
            >
              {loading
                ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Creating…</>
                : <><CheckCircle2 className="mr-2 h-4 w-4" /> Create Lead</>}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateLead;
