import { FieldPath, FieldValues, UseFormReturn } from 'react-hook-form';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface TextareaFieldProps<T extends FieldValues> {
  form: UseFormReturn<T>;
  name: FieldPath<T>;
  label: string;
  placeholder?: string;
  description?: string;
  required?: boolean;
  disabled?: boolean;
  rows?: number;
  /** Shows a live "n / min words" counter. Used by the cancellation-reason flow. */
  minWords?: number;
  className?: string;
}

const countWords = (value: unknown): number =>
  String(value ?? '').trim().split(/\s+/).filter(Boolean).length;

function TextareaField<T extends FieldValues>({
  form,
  name,
  label,
  placeholder,
  description,
  required,
  disabled,
  rows = 4,
  minWords,
  className,
}: TextareaFieldProps<T>) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field, fieldState }) => {
        const words = minWords ? countWords(field.value) : 0;
        const met = minWords ? words >= minWords : true;

        return (
          <FormItem className={className}>
            <div className="flex items-baseline justify-between gap-2">
              <FormLabel className="text-[13px] font-semibold text-foreground/90">
                {label}
                {required && <span className="ml-0.5 text-destructive">*</span>}
              </FormLabel>
              {minWords && (
                <span
                  className={cn(
                    'text-[11px] font-medium tabular-nums',
                    met ? 'text-success' : 'text-muted-foreground'
                  )}
                >
                  {words} / {minWords} words
                </span>
              )}
            </div>
            <FormControl>
              <Textarea
                {...field}
                value={field.value ?? ''}
                rows={rows}
                placeholder={placeholder}
                disabled={disabled}
                aria-invalid={Boolean(fieldState.error)}
                className={cn(
                  'resize-y text-sm',
                  fieldState.error && 'border-destructive focus-visible:ring-destructive/40'
                )}
              />
            </FormControl>
            {description && <FormDescription className="text-xs">{description}</FormDescription>}
            <FormMessage className="text-xs" />
          </FormItem>
        );
      }}
    />
  );
}

export default TextareaField;
