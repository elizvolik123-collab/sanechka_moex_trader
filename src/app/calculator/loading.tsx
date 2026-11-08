import { Skeleton } from "@/components/ui/skeleton";

export default function CalculatorLoading() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Загрузка калькулятора">
      <div className="grid gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid gap-6">
          <Skeleton className="h-48" />
          <Skeleton className="h-96" />
        </div>
        <Skeleton className="h-80" />
      </div>
    </div>
  );
}
