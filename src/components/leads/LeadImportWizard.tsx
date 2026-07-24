import React, { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import {
  Upload,
  Download,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  ArrowRight,
  Database,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import * as XLSX from 'xlsx';

// The fields in our leads database table
const DB_LEAD_FIELDS = [
  { key: 'customer_name', label: 'Customer Name *', required: true },
  { key: 'mobile', label: 'Mobile Number *', required: true },
  { key: 'alt_mobile', label: 'Alternate Mobile', required: false },
  { key: 'email', label: 'Email Address', required: false },
  { key: 'k_number', label: 'K Number', required: false },
  { key: 'address', label: 'Full Address', required: false },
  { key: 'village_city', label: 'Village / City', required: false },
  { key: 'district', label: 'District', required: false },
  { key: 'state', label: 'State', required: false },
  { key: 'kw_interest', label: 'kW Interest', required: false },
  { key: 'notes', label: 'Notes', required: false },
];

interface LeadImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
}

type FileRow = Record<string, string>;

export default function LeadImportWizard({
  open,
  onOpenChange,
  onImportComplete,
}: LeadImportWizardProps) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Wizard state
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<FileRow[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);

  // Results
  const [successCount, setSuccessCount] = useState(0);
  const [failedRows, setFailedRows] = useState<{ rowNum: number; data: FileRow; error: string }[]>([]);

  // Reset all states
  const handleReset = () => {
    setStep(1);
    setFile(null);
    setHeaders([]);
    setParsedRows([]);
    setMappings({});
    setImporting(false);
    setProgress(0);
    setSuccessCount(0);
    setFailedRows([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Download Sample CSV
  const handleDownloadSample = () => {
    const csvHeaders = DB_LEAD_FIELDS.map((f) => f.label.replace(' *', ''));
    const sampleRows = [
      ['LAL CHAND RATHORE', '9876543210', '9876543211', 'lalchand@example.com', '210721033383', 'H.NO-457 VINOBA BHAWEY NAGAR', 'Kota', 'Kota', 'Rajasthan', '3', 'Domestic load connection details.'],
      ['RAMESH KUMAR', '8765432109', '', 'ramesh@example.com', '', '12-B NEW COLONY', 'Jaipur', 'Jaipur', 'Rajasthan', '5', 'Interested in cash option.'],
    ];

    const csvContent = [
      csvHeaders.join(','),
      ...sampleRows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'solar_leads_sample.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle File Upload and Parsing
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const fileExt = selectedFile.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(fileExt || '')) {
      toast.error('Unsupported file format. Please upload CSV, XLSX, or XLS.');
      return;
    }

    setFile(selectedFile);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        // Parse sheet to array of arrays (raw format to handle headers correctly)
        const sheetData = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1 });
        if (sheetData.length === 0) {
          toast.error('The uploaded file is empty.');
          return;
        }

        const rawHeaders = (sheetData[0] as string[]).map((h) => String(h || '').trim());
        const validHeaders = rawHeaders.filter(Boolean);

        if (validHeaders.length === 0) {
          toast.error('Could not find headers in the first row.');
          return;
        }

        // Parse data rows
        const rows: FileRow[] = [];
        for (let i = 1; i < sheetData.length; i++) {
          const rowData = sheetData[i] as string[];
          if (!rowData || rowData.length === 0 || rowData.every((cell) => cell === undefined || cell === null || cell === '')) {
            continue; // Skip empty rows
          }

          const fileRow: FileRow = {};
          rawHeaders.forEach((header, index) => {
            if (header) {
              const val = rowData[index];
              fileRow[header] = val !== undefined && val !== null ? String(val).trim() : '';
            }
          });
          rows.push(fileRow);
        }

        setHeaders(validHeaders);
        setParsedRows(rows);

        // Attempt smart mapping of columns
        const initialMappings: Record<string, string> = {};
        validHeaders.forEach((header) => {
          const lowerHeader = header.toLowerCase().replace(/[^a-z0-9]/g, '');
          const matchedField = DB_LEAD_FIELDS.find((field) => {
            const cleanFieldKey = field.key.toLowerCase().replace(/[^a-z0-9]/g, '');
            const cleanFieldLabel = field.label.toLowerCase().replace(/[^a-z0-9]/g, '');
            return (
              lowerHeader === cleanFieldKey ||
              lowerHeader.includes(cleanFieldKey) ||
              cleanFieldLabel.includes(lowerHeader) ||
              lowerHeader.includes(cleanFieldLabel)
            );
          });
          if (matchedField) {
            initialMappings[matchedField.key] = header;
          }
        });
        setMappings(initialMappings);

        // Go to preview and mapping step
        setStep(2);
      } catch (err: any) {
        toast.error('Failed to parse file: ' + err.message);
      }
    };

    reader.readAsBinaryString(selectedFile);
  };

  // Run the import process
  const handleStartImport = async () => {
    if (!user?.id) {
      toast.error('Authentication session expired. Please log in again.');
      return;
    }

    // Validate that required fields are mapped
    const missingFields = DB_LEAD_FIELDS.filter((f) => f.required && !mappings[f.key]);
    if (missingFields.length > 0) {
      toast.error(`Please map all required fields: ${missingFields.map((f) => f.label).join(', ')}`);
      return;
    }

    setStep(3);
    setImporting(true);
    setProgress(0);

    let succeeded = 0;
    const failures: typeof failedRows = [];

    const total = parsedRows.length;
    if (total === 0) {
      setImporting(false);
      setStep(4);
      return;
    }

    // Process rows in batches or sequentially
    for (let index = 0; index < total; index++) {
      const row = parsedRows[index];
      const rowNum = index + 2; // Row number in sheet (1-based, plus header row)

      // Map values
      const customerName = row[mappings['customer_name']] || '';
      const mobileRaw = row[mappings['mobile']] || '';
      const mobile = mobileRaw.replace(/\D/g, ''); // Extract digits only
      const altMobileRaw = row[mappings['alt_mobile']] || '';
      const altMobile = altMobileRaw.replace(/\D/g, '') || null;
      const email = row[mappings['email']] || null;
      const kNumber = row[mappings['k_number']] || null;
      const address = row[mappings['address']] || '';
      const villageCity = row[mappings['village_city']] || '';
      const district = row[mappings['district']] || '';
      const state = row[mappings['state']] || '';
      const kwInterestRaw = row[mappings['kw_interest']];
      const kwInterest = kwInterestRaw ? parseFloat(kwInterestRaw) : null;
      const notes = row[mappings['notes']] || null;

      // Validation check
      if (!customerName) {
        failures.push({ rowNum, data: row, error: 'Customer Name is empty' });
        continue;
      }

      if (!mobile || mobile.length !== 10 || !/^[6-9]/.test(mobile)) {
        failures.push({ rowNum, data: row, error: `Invalid mobile number: "${mobileRaw}" (must be 10 digits starting with 6-9)` });
        continue;
      }

      try {
        // Build payload — only add optional new columns when they have values
        // to avoid PostgREST schema-cache errors if the DB migration hasn't refreshed
        const rowPayload: Record<string, any> = {
          customer_name: customerName,
          mobile: mobile,
          alt_mobile: altMobile,
          address: address || 'Imported Lead Address',
          village_city: villageCity || 'Unknown City',
          district: district || 'Unknown District',
          state: state || 'Rajasthan',
          kw_interest: isNaN(kwInterest as number) ? null : kwInterest,
          source: 'online',
          notes: notes,
          created_by_user_id: user.id,
          status: 'new',
        };
        if (email) rowPayload['email'] = email;
        if (kNumber) rowPayload['k_number'] = kNumber;

        const { error } = await supabase.from('leads').insert(rowPayload);

        if (error) {
          if (error.message.includes('duplicate key') || error.code === '23505') {
            failures.push({ rowNum, data: row, error: `Duplicate lead: Mobile ${mobile} already exists` });
          } else {
            failures.push({ rowNum, data: row, error: error.message });
          }
        } else {
          succeeded++;
        }
      } catch (err: any) {
        failures.push({ rowNum, data: row, error: err.message || String(err) });
      }

      // Update progress bar
      setProgress(Math.round(((index + 1) / total) * 100));
    }

    setSuccessCount(succeeded);
    setFailedRows(failures);
    setImporting(false);
    setStep(4);
    onImportComplete();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!importing) onOpenChange(v); }}>
      <DialogContent className="max-w-3xl sm:rounded-2xl max-h-[90vh] flex flex-col p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <FileSpreadsheet className="h-5 w-5 text-primary" /> Import Leads Wizard
          </DialogTitle>
          <DialogDescription>
            Import multiple leads in bulk using CSV, Excel (.xlsx) or XLS spreadsheet templates.
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Upload File */}
        {step === 1 && (
          <div className="space-y-6 py-4 flex-1 flex flex-col justify-center">
            <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-8 bg-muted/20 hover:bg-muted/40 transition-colors">
              <Upload className="h-10 w-10 text-muted-foreground mb-4" />
              <p className="font-medium text-foreground mb-1 text-center">Drag and drop your spreadsheet here</p>
              <p className="text-xs text-muted-foreground mb-4 text-center">Supports CSV, XLSX, and XLS up to 10MB</p>
              
              <Input
                type="file"
                accept=".csv, .xlsx, .xls"
                onChange={handleFileChange}
                className="hidden"
                id="lead-file-upload"
                ref={fileInputRef}
              />
              <Button asChild className="cursor-pointer">
                <label htmlFor="lead-file-upload">Choose File</label>
              </Button>
            </div>

            <div className="flex justify-between items-center bg-card border rounded-lg p-4 shadow-sm">
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-foreground">Need a starting template?</p>
                <p className="text-xs text-muted-foreground">Download our pre-formatted CSV structure with correct columns.</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleDownloadSample} className="shrink-0 gap-1.5">
                <Download className="h-4 w-4" /> Download Sample
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Mapping & Preview */}
        {step === 2 && (
          <div className="space-y-4 py-2 flex-1 overflow-hidden flex flex-col">
            <Alert className="bg-primary/5 border-primary/20">
              <Database className="h-4 w-4 text-primary" />
              <AlertTitle className="text-sm font-semibold">Map File Headers to Lead Fields</AlertTitle>
              <AlertDescription className="text-xs">
                Link the columns in your uploaded file <span className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">{file?.name}</span> to the correct Leads database fields. Required fields are marked with (*).
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 overflow-hidden">
              {/* Mapping fields form */}
              <div className="border rounded-xl p-4 bg-muted/20 flex flex-col">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Field Mapping</p>
                <ScrollArea className="flex-1 pr-2">
                  <div className="space-y-3">
                    {DB_LEAD_FIELDS.map((field) => (
                      <div key={field.key} className="grid grid-cols-[130px_1fr] items-center gap-2">
                        <Label className="text-xs font-medium text-foreground">{field.label}</Label>
                        <Select
                          value={mappings[field.key] || 'skip'}
                          onValueChange={(val) =>
                            setMappings((prev) => ({
                              ...prev,
                              [field.key]: val === 'skip' ? '' : val,
                            }))
                          }
                        >
                          <SelectTrigger className="h-9 text-xs">
                            <SelectValue placeholder="-- Skip Field --" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="skip">-- Skip Field --</SelectItem>
                            {headers.map((h) => (
                              <SelectItem key={h} value={h}>
                                {h}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* Data Preview */}
              <div className="border rounded-xl p-4 flex flex-col">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">File Data Preview (First 4 rows)</p>
                <ScrollArea className="flex-1">
                  <div className="space-y-2.5">
                    {parsedRows.slice(0, 4).map((row, i) => (
                      <div key={i} className="text-xs border rounded p-2.5 bg-card space-y-1">
                        <p className="font-semibold text-[10px] text-muted-foreground uppercase">Row {i + 2}</p>
                        <div className="grid grid-cols-2 gap-1 font-mono text-[10px]">
                          {Object.entries(row).slice(0, 5).map(([k, v]) => (
                            <div key={k} className="truncate">
                              <span className="text-muted-foreground">{k}:</span> <span className="text-foreground font-semibold">{v || '—'}</span>
                            </div>
                          ))}
                          {Object.keys(row).length > 5 && (
                            <div className="text-muted-foreground italic text-[9px] col-span-2">
                              + {Object.keys(row).length - 5} more columns
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button variant="ghost" onClick={handleReset}>Back / Reset</Button>
              <Button onClick={handleStartImport} className="gap-1.5">
                Start Import <ArrowRight className="h-4 w-4" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 3: Progress */}
        {step === 3 && (
          <div className="space-y-6 py-12 flex-1 flex flex-col justify-center items-center text-center">
            <RefreshCw className="h-10 w-10 text-primary animate-spin mb-4" />
            <p className="font-semibold text-lg">Importing Leads in Bulk...</p>
            <p className="text-sm text-muted-foreground max-w-sm mb-4">
              Writing records to the CRM database. Please do not close this window.
            </p>
            <div className="w-full max-w-md space-y-2">
              <Progress value={progress} className="h-2 w-full" />
              <p className="text-xs text-muted-foreground font-mono">{progress}% Complete</p>
            </div>
          </div>
        )}

        {/* Step 4: Summary Report */}
        {step === 4 && (
          <div className="space-y-4 py-2 flex-1 overflow-hidden flex flex-col">
            <div className="grid grid-cols-2 gap-4">
              <div className="border rounded-xl p-4 bg-emerald-500/5 border-emerald-500/20 text-center space-y-1">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
                <p className="text-2xl font-bold text-emerald-600">{successCount}</p>
                <p className="text-xs font-semibold text-muted-foreground uppercase">Leads Imported</p>
              </div>
              <div className={`border rounded-xl p-4 text-center space-y-1 ${failedRows.length > 0 ? 'bg-destructive/5 border-destructive/20' : 'bg-muted/30 border-border'}`}>
                {failedRows.length > 0 ? (
                  <XCircle className="h-8 w-8 text-destructive mx-auto" />
                ) : (
                  <CheckCircle2 className="h-8 w-8 text-muted-foreground mx-auto" />
                )}
                <p className={`text-2xl font-bold ${failedRows.length > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{failedRows.length}</p>
                <p className="text-xs font-semibold text-muted-foreground uppercase">Rows Failed</p>
              </div>
            </div>

            {failedRows.length > 0 && (
              <div className="border rounded-xl p-4 flex-1 overflow-hidden flex flex-col">
                <p className="text-xs font-bold uppercase tracking-wider text-destructive flex items-center gap-1 mb-2">
                  <AlertTriangle className="h-4 w-4" /> Errors Report
                </p>
                <ScrollArea className="flex-1 bg-muted/40 rounded p-2">
                  <div className="space-y-1.5 font-mono text-[10px]">
                    {failedRows.map((fail, i) => (
                      <div key={i} className="p-2 border-b last:border-0 border-border flex flex-col gap-0.5">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-destructive">Row {fail.rowNum}</span>
                          <Badge variant="outline" className="text-[8px] py-0 px-1 border-destructive/40 text-destructive bg-destructive/5">
                            {fail.error}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground truncate">
                          Customer: {fail.data[mappings['customer_name']] || '—'} • Mobile: {fail.data[mappings['mobile']] || '—'}
                        </p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button onClick={handleReset} variant="outline">Import Another File</Button>
              <Button onClick={() => onOpenChange(false)}>Done & Close</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
