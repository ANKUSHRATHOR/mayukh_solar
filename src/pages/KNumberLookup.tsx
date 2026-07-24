import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { fetchConsumerDetails } from "@/lib/discom";

type LookupResult = {
  ok: boolean;
  status: number;
  data: Record<string, unknown> | { raw: string } | null;
};

const formatLabel = (key: string) =>
  key.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const KNumberLookup = () => {
  const [kno, setKno] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = kno.trim();
    if (!trimmed) {
      setError("Please enter a K Number.");
      return;
    }
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const response = await fetchConsumerDetails(trimmed);
      setResult(response as LookupResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed.");
    } finally {
      setLoading(false);
    }
  };

  const renderDetails = () => {
    if (!result) return null;
    const { data, ok, status } = result;

    if (!ok) {
      return (
        <Alert variant="destructive">
          <AlertTitle>Upstream error ({status})</AlertTitle>
          <AlertDescription>
            The provider returned an error for this K Number.
          </AlertDescription>
        </Alert>
      );
    }

    if (!data) {
      return (
        <Alert>
          <AlertTitle>No data</AlertTitle>
          <AlertDescription>No consumer found for this K Number.</AlertDescription>
        </Alert>
      );
    }

    if ("raw" in data && typeof data.raw === "string") {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Raw response</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
              {data.raw}
            </pre>
            <p className="mt-2 text-xs text-muted-foreground">
              The endpoint returned non-JSON content. Update the proxy to parse it
              into structured fields.
            </p>
          </CardContent>
        </Card>
      );
    }

    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) {
      return (
        <Alert>
          <AlertTitle>Empty result</AlertTitle>
          <AlertDescription>No fields returned.</AlertDescription>
        </Alert>
      );
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle>Consumer details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {entries.map(([key, value]) => (
              <div key={key} className="rounded-md border p-3">
                <dt className="text-xs font-medium text-muted-foreground">
                  {formatLabel(key)}
                </dt>
                <dd className="mt-1 break-words text-sm font-medium">
                  {value === null || value === undefined || value === ""
                    ? "—"
                    : typeof value === "object"
                      ? JSON.stringify(value)
                      : String(value)}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>K Number Lookup</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="kno">K Number</Label>
                <Input
                  id="kno"
                  value={kno}
                  onChange={(e) => setKno(e.target.value)}
                  placeholder="Enter consumer K Number"
                  autoComplete="off"
                  inputMode="numeric"
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full sm:w-auto">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Searching…
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" /> Fetch details
                  </>
                )}
              </Button>
            </form>

            {error && (
              <Alert variant="destructive" className="mt-4">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <div className="mt-4">{renderDetails()}</div>
      </div>
    </div>
  );
};

export default KNumberLookup;
