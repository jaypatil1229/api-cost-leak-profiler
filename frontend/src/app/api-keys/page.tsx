"use client";

import { useState } from "react";
import { useSession } from "@/components/auth/session-provider";
import { apiRequest } from "@/lib/api/client";
import { useProject } from "@/hooks/use-project";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyRound, Copy, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface ApiKey {
  id: string;
  rawKey: string;
  name: string;
  scopes: string[];
  expiresAt: string | null;
  createdAt: string;
}

export default function ApiKeyGeneratorPage() {
  const { user } = useSession();
  const { projectId } = useProject();
  const [generatedKey, setGeneratedKey] = useState<ApiKey | null>(null);
  const [loading, setLoading] = useState(false);
  const [keyName, setKeyName] = useState("SDK Test Key");
  const [error, setError] = useState<string | null>(null);

  async function generateApiKey() {
    if (!projectId) {
      setError("No project found. Please create a project first.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<ApiKey>(
        `/projects/${projectId}/api-keys`,
        {
          method: "POST",
          auth: true,
          body: {
            name: keyName,
            scopes: ["USAGE_WRITE"],
          },
        }
      );

      setGeneratedKey(response as ApiKey);
      navigator.clipboard.writeText((response as any).rawKey || "");
      toast.success("API key generated!", {
        description: "Key has been copied to clipboard. Store it securely!",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setError(message);
      toast.error("Failed to generate API key", { description: message });
    } finally {
      setLoading(false);
    }
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>API Key Generation</CardTitle>
            <CardDescription>Please sign in to generate an API key.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <a href="/sign-in">Sign In</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Generate API Key
          </CardTitle>
          <CardDescription>
            Create an API key with USAGE_WRITE scope for the SDK test app.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {!generatedKey ? (
            <div className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-md text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm">{error}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="key-name">Key Name</Label>
                <Input
                  id="key-name"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder="e.g., SDK Test Key"
                  disabled={loading}
                />
              </div>

              <Button
                onClick={generateApiKey}
                disabled={loading}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating API Key...
                  </>
                ) : (
                  "Generate API Key"
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Generated API Key</Label>
                <div className="p-3 bg-muted rounded-lg font-mono text-sm break-all">
                  {generatedKey.rawKey}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(generatedKey.rawKey);
                    toast.success("Key copied to clipboard");
                  }}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Key
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label>Name</Label>
                  <p className="font-medium">{generatedKey.name}</p>
                </div>
                <div>
                  <Label>Scopes</Label>
                  <p className="font-medium">{generatedKey.scopes.join(", ")}</p>
                </div>
              </div>

              <Button variant="outline" onClick={() => setGeneratedKey(null)}>
                Generate Another Key
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}