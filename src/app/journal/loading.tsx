import { Skeleton } from "@/components/ui/skeleton";

/** Скелетон дневника: повторяет раскладку страницы, чтобы при загрузке ничего не прыгало. */
export default function JournalLoading() {
  return (
    <div className="grid grid-cols-1 gap-6" aria-busy="true" aria-label="Загрузка дневника">
      <div className="grid gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-9 w-full" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-80" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 lg:col-span-2" />
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}
