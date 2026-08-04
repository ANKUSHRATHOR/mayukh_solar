import { invokeApi } from "@/lib/apiClient";

export interface DiscomLookupResult {
  ok: boolean;
  status: number;
  data: any;
}

export async function fetchConsumerDetails(kno: string): Promise<DiscomLookupResult> {
  const trimmed = kno.trim();
  
  // 1. In local development, prefer using the Vite proxy directly (avoids CORS & local supabase serve setup)
  if (import.meta.env.DEV) {
    try {
      const url = `https://cescrajasthan.co.in/newconnection/it_request_handler.jsp?paramStr=service_kno_newcondet|${trimmed}`;
      const res = await fetch(url);
      if (res.ok) {
        const text = await res.text();
        let parsed: any;
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = { raw: text };
        }
        return {
          ok: true,
          status: res.status,
          data: parsed,
        };
      }
    } catch (err) {
      console.warn("Dev proxy lookup failed, falling back to the backend API...", err);
    }
  }

  // 2. Production or fallback: call the backend lookup proxy
  const { data, error } = await invokeApi<DiscomLookupResult>("consumer-lookup", {
    body: { kno: trimmed },
  });

  if (error) {
    throw new Error(error.message || "Failed to query lookup proxy function");
  }

  return data as DiscomLookupResult;
}
