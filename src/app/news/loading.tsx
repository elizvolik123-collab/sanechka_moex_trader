import { Skeleton } from "@/components/ui/skeleton";

export default function NewsLoading() {
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6" aria-busy="true" aria-label="Загрузка новостей">
      <div className="grid gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-full" />
      </div>
      <Skeleton className="h-10" />
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-40" />
      ))}
    </div>
  );
}
