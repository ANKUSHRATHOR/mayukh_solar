import { FieldPath, FieldValues, UseFormReturn } from 'react-hook-form';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectFieldProps<T extends FieldValues> {
  form: UseFormReturn<T>;
  name: FieldPath<T>;
  label: string;
  options: SelectOption[];
  placeholder?: string;
  description?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Dropdown bound to react-hook-form.
 *
 * Empty-string values are filtered out: Radix Select reserves `""` for the
 * placeholder state and throws if an item uses it.
 */
function SelectField<T extends FieldValues>({
  form,
  name,
  label,
  options,
  placeholder = 'Select…',
  description,
  required,
  disabled,
  className,
}: SelectFieldProps<T>) {
  const usable = options.filter((opt) => opt.value !== '');

  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem className={className}>
          <FormLabel className="text-[13px] font-semibold text-foreground/90">
            {label}
            {required && <span className="ml-0.5 text-destructive">*</span>}
          </FormLabel>
          <Select
            value={field.value ? String(field.value) : undefined}
            onValueChange={field.onChange}
            disabled={disabled}
          >
            <FormControl>
              <SelectTrigger
                aria-invalid={Boolean(fieldState.error)}
                className={cn(
                  'h-10 text-sm',
                  fieldState.error && 'border-destructive focus:ring-destructive/40'
                )}
              >
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {usable.length === 0 ? (
                <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                  No options available
                </div>
              ) : (
                usable.map((opt) => (
                  <SelectItem
                    key={opt.value}
                    value={opt.value}
                    disabled={opt.disabled}
                    className="text-sm"
                  >
                    {opt.label}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {description && <FormDescription className="text-xs">{description}</FormDescription>}
          <FormMessage className="text-xs" />
        </FormItem>
      )}
    />
  );
}

export default SelectField;
