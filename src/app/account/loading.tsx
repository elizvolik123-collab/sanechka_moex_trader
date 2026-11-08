import { Skeleton } from "@/components/ui/skeleton";

/** Внутри макета кабинета: заголовок и меню уже видны, грузится только содержимое раздела. */
export default function AccountLoading() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Загрузка">
      <Skeleton className="h-40" />
      <Skeleton className="h-64" />
    </div>
  );
}
