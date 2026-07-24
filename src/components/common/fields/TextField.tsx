import { ReactNode } from 'react';
import { FieldPath, FieldValues, UseFormReturn } from 'react-hook-form';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface TextFieldProps<T extends FieldValues> {
  form: UseFormReturn<T>;
  name: FieldPath<T>;
  label: string;
  placeholder?: string;
  /** Helper text under the input. Explain the format, not the obvious. */
  description?: string;
  type?: 'text' | 'email' | 'tel' | 'number' | 'password' | 'url' | 'date' | 'time';
  required?: boolean;
  disabled?: boolean;
  /** Icon or unit rendered inside the right edge, e.g. "kW". */
  suffix?: ReactNode;
  inputMode?: 'text' | 'numeric' | 'decimal' | 'tel' | 'email';
  autoComplete?: string;
  className?: string;
}

/**
 * Text input bound to react-hook-form. Errors render inline beneath the field
 * and the input is marked `aria-invalid`, so the failing field is obvious
 * without hunting for a toast.
 */
function TextField<T extends FieldValues>({
  form,
  name,
  label,
  placeholder,
  description,
  type = 'text',
  required,
  disabled,
  suffix,
  inputMode,
  autoComplete,
  className,
}: TextFieldProps<T>) {
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
          <FormControl>
            <div className="relative">
              <Input
                {...field}
                // A null/undefined value would flip the input to uncontrolled
                // and React would warn on the first keystroke.
                value={field.value ?? ''}
                type={type}
                inputMode={inputMode}
                autoComplete={autoComplete}
                placeholder={placeholder}
                disabled={disabled}
                aria-invalid={Boolean(fieldState.error)}
                className={cn(
                  'h-10 text-sm',
                  suffix && 'pr-12',
                  fieldState.error && 'border-destructive focus-visible:ring-destructive/40'
                )}
              />
              {suffix && (
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                  {suffix}
                </span>
              )}
            </div>
          </FormControl>
          {description && <FormDescription className="text-xs">{description}</FormDescription>}
          <FormMessage className="text-xs" />
        </FormItem>
      )}
    />
  );
}

export default TextField;
