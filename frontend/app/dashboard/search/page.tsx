"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Search, FileText, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { collectionsApi, searchApi, Collection, SearchResult, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function SearchPage() {
  const { currentOrg } = useAuth();
  const orgId = currentOrg!.organizationId;

  const [collections, setCollections] = useState<Collection[]>([]);
  const [query, setQuery] = useState("");
  const [collectionId, setCollectionId] = useState<string>("all");
  const [name, setName] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    collectionsApi
      .list(orgId)
      .then((res) => setCollections(res.collections))
      .catch(() => undefined);
  }, [orgId]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || searching) return;
    setSearching(true);
    try {
      const { results } = await searchApi.search(orgId, {
        query: query.trim(),
        collectionId: collectionId === "all" ? undefined : collectionId,
        name: name.trim() || undefined,
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
      });
      setResults(results);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Поиск не удался");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl p-6">
      <h1 className="mb-6 text-2xl font-semibold">Поиск по документам</h1>

      <form onSubmit={handleSearch} className="mb-6 space-y-3">
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Семантический поиск: «правила удалённой работы», «еңбек демалысы»..."
            className="flex-1"
          />
          <Button type="submit" disabled={searching || !query.trim()} className="gap-2">
            <Search className="h-4 w-4" />
            {searching ? "Ищем..." : "Найти"}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={collectionId}
            onValueChange={(v) => setCollectionId(v ?? "all")}
            items={{
              all: "Все коллекции",
              ...Object.fromEntries(collections.map((c) => [c.id, c.name])),
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все коллекции</SelectItem>
              {collections.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Название файла..."
            className="w-48"
          />
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <span>с</span>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36" />
            <span>по</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36" />
          </div>
        </div>
      </form>

      {results !== null && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {results.length === 0 ? "Ничего не найдено" : `Найдено фрагментов: ${results.length}`}
          </p>
          {results.map((r) => (
            <Card key={r.chunkId}>
              <CardContent className="space-y-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="gap-1">
                    <FileText className="h-3 w-3" />
                    {r.filename}
                    {r.pageNumber ? `, стр. ${r.pageNumber}` : ""}
                  </Badge>
                  {r.collectionName && (
                    <Badge variant="secondary" className="gap-1">
                      <Folder className="h-3 w-3" />
                      {r.collectionName}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">релевантность {r.relevance}%</span>
                </div>
                <p className="text-sm text-muted-foreground">{r.snippet}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
